import nodemailer from "nodemailer";

/**
 * Versand der Kontaktformular-Nachrichten per SMTP (nodemailer) über den Mailserver des Betreibers.
 * Nichts wird gespeichert, nichts wiederholt; Fehler tragen nie Zugangsdaten oder Texte der Besucher.
 *
 * Umgebung:
 * - MARKENFREI_SMTP_URL: smtps://user:pass@host:465 (TLS von Anfang an) oder smtp://user:pass@host:587
 *   (STARTTLS Pflicht). Sonderzeichen in Benutzer und Passwort URL-kodieren (@ als %40). Unverschlüsseltes
 *   smtp:// nur zu localhost, 127.0.0.1 oder [::1]; zu jedem anderen Host wird es abgelehnt.
 * - MARKENFREI_CONTACT_TO: Empfänger (Standard: MARKENFREI_OPERATOR_EMAIL)
 * - MARKENFREI_CONTACT_FROM: Absender (Standard: SMTP-Benutzer, wenn er eine Adresse ist, sonst Empfänger)
 */

export const CONTACT_SUBJECT = "Markenfrei Kontaktformular: neue Nachricht";
export const CONTACT_FOOTER = "Gesendet über das Kontaktformular von markenfrei.app";

/** Zeitgrenzen in Millisekunden */
export const SMTP_CONNECTION_TIMEOUT_MS = 5_000;
export const SMTP_GREETING_TIMEOUT_MS = 5_000;
export const SMTP_SOCKET_TIMEOUT_MS = 10_000;
export const SMTP_TOTAL_BUDGET_MS = 15_000;

export type SmtpOptions = {
  host: string;
  port: number;
  /** TLS von Anfang an (smtps) */
  secure: boolean;
  /** STARTTLS erzwingen: ohne Verschlüsselung wird nichts gesendet */
  requireTLS: boolean;
  auth?: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  disableFileAccess: true;
  disableUrlAccess: true;
};

export type MailConfig = {
  smtp: SmtpOptions;
  to: string;
  from: string;
};

/** problem: nur gesetzt, wenn MARKENFREI_SMTP_URL fehlerhaft ist (ohne Zugangsdaten); null, wenn sie fehlt. */
export type MailConfigResult =
  | { configured: true; config: MailConfig }
  | { configured: false; problem: string | null };

export type ContactMessage = { name: string; email: string; message: string };

type OutgoingMail = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
};

export type MailTransport = {
  sendMail(mail: OutgoingMail): Promise<unknown>;
  close?(): void;
};

/** Erzeugt den Transport; Tests reichen hier eine Attrappe ein. */
export type TransportFactory = (options: SmtpOptions) => MailTransport;

const defaultTransportFactory: TransportFactory = (options) => nodemailer.createTransport(options);

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const EMAIL_PATTERN = /^[^\s@<>"',;:()\\[\]\p{Cc}]+@[^\s@<>"',;:()\\[\]\p{Cc}]+\.[^\s@<>"',;:()\\[\]\p{Cc}]+$/u;

const clean = (v: string | undefined) => (v ?? "").trim();

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function fail(problem: string): MailConfigResult {
  return { configured: false, problem };
}

export function mailConfigFromEnv(env: Record<string, string | undefined> = process.env): MailConfigResult {
  const rawUrl = clean(env.MARKENFREI_SMTP_URL);
  if (!rawUrl) return { configured: false, problem: null };

  // Die URL selbst kommt nie in eine Meldung: sie enthält das Passwort.
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return fail("MARKENFREI_SMTP_URL ist keine gültige URL (erwartet: smtps://Benutzer:Passwort@Host:465).");
  }
  const scheme = url.protocol;
  if (scheme !== "smtps:" && scheme !== "smtp:") {
    return fail("MARKENFREI_SMTP_URL muss mit smtps:// oder smtp:// beginnen.");
  }
  if (!url.hostname) return fail("MARKENFREI_SMTP_URL enthält keinen Host.");
  if (url.search || url.hash || (url.pathname && url.pathname !== "/")) {
    return fail("MARKENFREI_SMTP_URL darf keinen Pfad und keine Parameter enthalten.");
  }

  const secure = scheme === "smtps:";
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  const port = url.port ? Number(url.port) : secure ? 465 : loopback ? 25 : 587;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fail("MARKENFREI_SMTP_URL enthält einen ungültigen Port.");

  // Ohne TLS nur zum eigenen Rechner. Zu anderen Hosts ist smtp:// nur auf dem Submission-Port 587
  // mit erzwungenem STARTTLS erlaubt; alles andere könnte Zugangsdaten und Nachrichten im Klartext senden.
  if (!secure && !loopback && port !== 587) {
    return fail("smtp:// ist zu entfernten Hosts nur auf Port 587 mit STARTTLS erlaubt; sonst smtps:// auf Port 465 nutzen.");
  }

  const user = decode(url.username);
  const pass = decode(url.password);
  if (user === null || pass === null) return fail("Benutzer oder Passwort in MARKENFREI_SMTP_URL sind nicht korrekt URL-kodiert.");
  if (/[\p{Cc}]/u.test(user + pass)) return fail("Benutzer oder Passwort in MARKENFREI_SMTP_URL enthalten Steuerzeichen.");

  const to = clean(env.MARKENFREI_CONTACT_TO) || clean(env.MARKENFREI_OPERATOR_EMAIL);
  if (!EMAIL_PATTERN.test(to)) {
    return fail("MARKENFREI_CONTACT_TO (oder MARKENFREI_OPERATOR_EMAIL) ist keine gültige E-Mail-Adresse.");
  }
  const fromEnv = clean(env.MARKENFREI_CONTACT_FROM);
  const from = fromEnv || (EMAIL_PATTERN.test(user) ? user : to);
  if (!EMAIL_PATTERN.test(from)) return fail("MARKENFREI_CONTACT_FROM ist keine gültige E-Mail-Adresse.");

  return {
    configured: true,
    config: {
      smtp: {
        host: url.hostname.replace(/^\[|\]$/g, ""),
        port,
        secure,
        requireTLS: !secure && !loopback,
        ...(user || pass ? { auth: { user, pass } } : {}),
        connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
        greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
        socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
        disableFileAccess: true,
        disableUrlAccess: true,
      },
      to,
      from,
    },
  };
}

/** Klartext der Nachricht. Absender der Mail ist nie der Besucher, seine Adresse steht hier und in Reply-To. */
export function contactMailText(msg: ContactMessage): string {
  return [
    `Name: ${msg.name || "(nicht angegeben)"}`,
    `E-Mail: ${msg.email}`,
    "",
    "Nachricht:",
    msg.message,
    "",
    "--",
    CONTACT_FOOTER,
    "",
  ].join("\n");
}

/** Der Versand ist gescheitert oder hat das Zeitbudget überschritten. Die Meldung ist absichtlich allgemein. */
export class MailSendError extends Error {
  /** code: nur ein Fehlercode wie EAUTH oder ECONNECTION (aus festen Zeichen), nie ein Text des Servers. */
  constructor(
    readonly reason: "timeout" | "failed",
    readonly code?: string,
  ) {
    super("Die Nachricht konnte nicht gesendet werden.");
    this.name = "MailSendError";
  }
}

function errorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object" || !("code" in err)) return undefined;
  return typeof err.code === "string" && /^[A-Z][A-Z0-9_]{2,24}$/.test(err.code) ? err.code : undefined;
}

/**
 * Sendet eine Kontaktnachricht. Von: der eingestellte Absender (nie die Adresse des Besuchers, sonst
 * scheitern SPF und DMARC), Reply-To: die geprüfte Adresse des Besuchers, Betreff fest ohne Besuchertext.
 * Wirft MailSendError ohne Ursache (Server- und Fehlertexte können Zugangsdaten oder Eingaben enthalten).
 */
export async function sendContactMail(
  config: MailConfig,
  msg: ContactMessage,
  createTransport: TransportFactory = defaultTransportFactory,
  totalBudgetMs: number = SMTP_TOTAL_BUDGET_MS,
): Promise<void> {
  let transport: MailTransport | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    transport = createTransport(config.smtp);
    const sending = transport.sendMail({
      from: config.from,
      to: config.to,
      replyTo: msg.email,
      subject: CONTACT_SUBJECT,
      text: contactMailText(msg),
    });
    // Ein Fehler nach Ablauf des Budgets darf keine unbehandelte Ablehnung auslösen.
    sending.catch(() => undefined);
    // Kein Promise.withResolvers: das gibt es erst ab Node 22, unterstützt wird Node 20.9.
    const budget = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new MailSendError("timeout")), totalBudgetMs);
    });
    await Promise.race([sending, budget]);
  } catch (err) {
    throw err instanceof MailSendError ? err : new MailSendError("failed", errorCode(err));
  } finally {
    clearTimeout(timer);
    try {
      transport?.close?.();
    } catch {
      // Schließen ist best effort
    }
  }
}
