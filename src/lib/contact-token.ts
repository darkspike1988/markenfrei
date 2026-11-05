import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { CONTACT_MAX_AGE_MS, CONTACT_MIN_FILL_MS } from "@/lib/contact-limits";

/**
 * Zeitmarke des Formulars, vom Server signiert: "<Millisekunden seit 1970>.<HMAC-SHA-256, base64url>".
 * Die Seite stellt sie beim Rendern aus, /api/contact prüft sie beim Absenden. So lässt sich weder eine
 * zu schnelle Übermittlung (Skript, weniger als 3 Sekunden nach dem Rendern) noch eine uralte Seite
 * (mehr als 2 Stunden) mit einer selbst gewählten Zeit vortäuschen.
 *
 * Grenzen (bewusst einfach gehalten):
 * - Das Geheimnis entsteht pro Prozess zufällig. Nach einem Neustart sind ausgestellte Marken ungültig,
 *   das Formular muss neu geladen werden. Mehrere Instanzen hinter einem Lastverteiler würden sich
 *   gegenseitig ablehnen (Sitzungsbindung nötig oder ein gemeinsames Geheimnis, das hier nicht vorgesehen ist).
 * - Die Marke ist nicht an eine Sitzung oder IP gebunden und innerhalb der zwei Stunden mehrfach verwendbar.
 *   Sie hält nur einfache Bots ab; den eigentlichen Schutz vor Massenversand bilden die Limits pro IP und
 *   pro Prozess in /api/contact.
 */

type SecretHolder = { __markenfreiContactSecret?: Buffer };

/**
 * Seite (Server-Komponente) und Route können in getrennten Modul-Instanzen laufen. Das Geheimnis liegt
 * deshalb am globalThis, damit beide denselben Wert sehen.
 */
function processSecret(): Buffer {
  const holder = globalThis as SecretHolder;
  holder.__markenfreiContactSecret ??= randomBytes(32);
  return holder.__markenfreiContactSecret;
}

function sign(timestamp: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(timestamp).digest("base64url");
}

export function issueContactToken(now: number = Date.now(), secret: Buffer = processSecret()): string {
  const ts = String(Math.floor(now));
  return `${ts}.${sign(ts, secret)}`;
}

export type TokenCheck = "ok" | "invalid" | "too_fast" | "expired";

export function checkContactToken(
  token: string,
  now: number = Date.now(),
  secret: Buffer = processSecret(),
): TokenCheck {
  const match = /^(\d{1,15})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return "invalid";
  const [, ts, sig] = match;
  const expected = Buffer.from(sign(ts, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  const age = now - Number(ts);
  if (age < CONTACT_MIN_FILL_MS) return "too_fast";
  if (age > CONTACT_MAX_AGE_MS) return "expired";
  return "ok";
}
