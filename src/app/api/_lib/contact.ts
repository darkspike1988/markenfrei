import { z } from "zod";
import { guard, isAllowedBrowserCall, isJsonContentType, jsonError, NO_STORE, readLimited } from "@/app/api/_lib/http";
import {
  CONTACT_EMAIL_MAX,
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  CONTACT_NAME_MAX,
} from "@/lib/contact-limits";
import { checkContactToken } from "@/lib/contact-token";
import {
  mailConfigFromEnv,
  MailSendError,
  sendContactMail,
  type MailConfigResult,
  type TransportFactory,
} from "@/lib/mail";
import { clientKey, createRateLimiter, type RateLimiter } from "@/lib/rate-limit";

/**
 * Handler für POST /api/contact (die Route in ../contact/route.ts reicht ihn nur durch; Route-Dateien
 * dürfen nichts anderes exportieren, deshalb liegt die Fabrik hier und ist testbar).
 *
 * Eingabe: { name?, email, message, consent: true, website: "", t }
 * - website ist die Honigfalle: Menschen sehen das Feld nicht. Ist es befüllt, antwortet die Route
 *   mit 200 { ok: true } und sendet nichts, damit Bots nichts lernen.
 * - t ist die signierte Renderzeit des Formulars (src/lib/contact-token.ts): frühestens 3 Sekunden,
 *   höchstens 2 Stunden alt.
 *
 * Schutz: wie /api/check (Origin, nur JSON, Body höchstens 8 KB, allgemeines Limit pro Client), dazu ein
 * eigenes Limit nur für verschickte Nachrichten: höchstens 3 pro Stunde und IP, 30 pro Stunde und Prozess.
 * Antworten enthalten nie Eingaben des Besuchers. Nichts wird gespeichert und nichts protokolliert,
 * was Name, Adresse oder Text verraten würde.
 */

const MAX_BODY_BYTES = 8 * 1024;
const WINDOW_MS = 3_600_000;
export const CONTACT_LIMIT_PER_IP = 3;
export const CONTACT_LIMIT_GLOBAL = 30;

/** Steuerzeichen (auch CR und LF) in Feldern, die in Mail-Kopfzeilen oder -Anzeigenamen landen */
const CONTROL = /[\p{Cc}]/u;
/** In der Nachricht sind Zeilenumbrüche und Tabs erlaubt, andere Steuerzeichen nicht */
const MESSAGE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

const bodySchema = z.object({
  name: z
    .string()
    .max(CONTACT_NAME_MAX)
    .refine((s) => !CONTROL.test(s))
    .transform((s) => s.trim())
    .optional(),
  email: z
    .string()
    .max(CONTACT_EMAIL_MAX)
    .refine((s) => !CONTROL.test(s))
    .pipe(z.email()),
  message: z
    .string()
    .max(CONTACT_MESSAGE_MAX * 2)
    .refine((s) => !MESSAGE_CONTROL.test(s))
    .transform((s) => s.trim())
    .pipe(z.string().min(CONTACT_MESSAGE_MIN).max(CONTACT_MESSAGE_MAX)),
  consent: z.literal(true),
  website: z.literal(""),
  t: z.string().max(100),
});

const FIELD_ERRORS: Record<string, string> = {
  name: `Der Name ist zu lang (höchstens ${CONTACT_NAME_MAX} Zeichen) oder enthält unzulässige Zeichen.`,
  email: "Bitte eine gültige E-Mail-Adresse angeben.",
  message: `Die Nachricht muss ${CONTACT_MESSAGE_MIN} bis ${CONTACT_MESSAGE_MAX} Zeichen lang sein.`,
  consent: "Bitte bestätige, dass du die Datenschutzerklärung gelesen hast.",
};

function fail(status: number, error: string, field?: string, headers: Record<string, string> = {}): Response {
  if (!field) return jsonError(status, error, headers);
  return Response.json({ error, field }, { status, headers: { ...NO_STORE, ...headers } });
}

const TOKEN_ERRORS = {
  invalid: "Das Formular ist ungültig. Bitte die Seite neu laden.",
  too_fast: "Das ging zu schnell. Bitte kurz warten und erneut absenden.",
  expired: "Das Formular ist abgelaufen. Bitte die Seite neu laden.",
} as const;

export type ContactHandlerDeps = {
  getConfig?: () => MailConfigResult;
  createTransport?: TransportFactory;
  now?: () => number;
  /** Limit pro Client-IP (Standard: 3 pro Stunde) */
  perClient?: RateLimiter;
  /** Limit pro Prozess (Standard: 30 pro Stunde) */
  perProcess?: RateLimiter;
};

export function createContactHandler(deps: ContactHandlerDeps = {}): (req: Request) => Promise<Response> {
  const getConfig = deps.getConfig ?? (() => mailConfigFromEnv());
  const now = deps.now ?? Date.now;
  const perClient = deps.perClient ?? createRateLimiter({ limit: CONTACT_LIMIT_PER_IP, windowMs: WINDOW_MS, now });
  const perProcess = deps.perProcess ?? createRateLimiter({ limit: CONTACT_LIMIT_GLOBAL, windowMs: WINDOW_MS, now });

  return async function POST(req: Request): Promise<Response> {
    if (!isAllowedBrowserCall(req)) return fail(403, "Aufrufe von fremden Seiten sind nicht erlaubt.");
    if (!isJsonContentType(req)) return fail(415, "Bitte als JSON senden (Content-Type: application/json).");
    // Allgemeines Limit pro Client, ohne das Limit für ausgehende Abfragen
    const busy = guard(req, 1, false);
    if (busy) return busy;

    let raw: string | null;
    try {
      raw = await readLimited(req, MAX_BODY_BYTES);
    } catch {
      return fail(400, "Die Anfrage konnte nicht gelesen werden.");
    }
    if (raw === null) return fail(413, "Die Anfrage ist zu groß (höchstens 8 KB).");

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return fail(400, "Die Anfrage ist kein gültiges JSON.");
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) return fail(400, "Ungültige Anfrage.");

    // Honigfalle: wirkt wie Erfolg, damit ein Bot das Feld nicht als Auslöser erkennt
    if ("website" in json && json.website !== "") return Response.json({ ok: true }, { headers: NO_STORE });

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] ?? "");
      return field in FIELD_ERRORS ? fail(400, FIELD_ERRORS[field], field) : fail(400, TOKEN_ERRORS.invalid);
    }
    const body = parsed.data;

    const token = checkContactToken(body.t, now());
    if (token !== "ok") return fail(400, TOKEN_ERRORS[token]);

    const mail = getConfig();
    if (!mail.configured) return fail(503, "Das Kontaktformular ist gerade nicht verfügbar.");

    // Erst jetzt zählt die Nachricht gegen das strenge Limit: Fehleingaben verbrauchen es nicht.
    const own = perClient.check(clientKey(req));
    const global = own.allowed ? perProcess.check("process") : own;
    if (!global.allowed) {
      return fail(
        429,
        "Es wurden zu viele Nachrichten gesendet. Bitte später erneut versuchen oder per E-Mail schreiben.",
        undefined,
        { "Retry-After": String(global.retryAfterSec) },
      );
    }

    try {
      await sendContactMail(
        mail.config,
        { name: body.name ?? "", email: body.email, message: body.message },
        deps.createTransport,
      );
    } catch (err) {
      // Nur Art und Fehlercode des Versands, nie Inhalte oder Serverantworten
      const e = err instanceof MailSendError ? err : null;
      console.error(`Kontaktformular: Versand fehlgeschlagen (${e?.reason ?? "failed"}${e?.code ? `, ${e.code}` : ""})`);
      return fail(502, "Die Nachricht konnte nicht gesendet werden. Bitte später erneut versuchen oder per E-Mail schreiben.");
    }
    return Response.json({ ok: true }, { headers: NO_STORE });
  };
}
