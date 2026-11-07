/**
 * Erinnerung als iCalendar-Datei (RFC 5545), rein und ohne Netz: Ein ganztägiger Termin 30 Tage nach dem
 * lokalen Datum. Entsteht nur im Browser, es wird nichts gesendet oder gespeichert.
 */

export const REMINDER_DAYS = 30;

const CRLF = "\r\n";
const MAX_OCTETS = 75;

/** Maskierung für TEXT-Werte: Backslash zuerst, dann Semikolon, Komma, Zeilenumbruch. */
export function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Faltet eine Zeile auf höchstens 75 Oktette (UTF-8), nie mitten in einem Zeichen. Folgezeilen beginnen mit Leerzeichen. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let used = 0;
  for (const ch of line) {
    const size = enc.encode(ch).length;
    // Folgezeilen tragen ein führendes Leerzeichen (1 Oktett)
    const limit = parts.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    if (used + size > limit) {
      parts.push(current);
      current = "";
      used = 0;
    }
    current += ch;
    used += size;
  }
  parts.push(current);
  return parts.join(CRLF + " ");
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Lokales Datum als YYYYMMDD. */
function localDate(d: Date): string {
  return `${pad(d.getFullYear(), 4)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** UTC-Zeitstempel als YYYYMMDDTHHMMSSZ. */
function utcStamp(d: Date): string {
  return (
    `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Lokales Datum plus n Tage über setDate (Monatsende und Zeitumstellung stimmen, keine Zeitzone nötig). */
function addDays(d: Date, days: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + days);
  return out;
}

export type ReminderInput = {
  /** Geprüfte Namen (mindestens einer). */
  names: readonly string[];
  /** Jetzt (lokale Zeit bestimmt das Datum, UTC den DTSTAMP). */
  now: Date;
  /** Zufällige Kennung, z. B. aus crypto.randomUUID(). */
  uid: string;
  /** Adresse der eigenen Seite mit ?q=…; sie wird als URL des Termins eingetragen. */
  url: string;
};

export function buildReminderIcs({ names, now, uid, url }: ReminderInput): string {
  const start = addDays(now, REMINDER_DAYS);
  const end = addDays(now, REMINDER_DAYS + 1);
  const summary = names.length === 1 ? `${names[0]} erneut prüfen` : `${names.length} Namen erneut prüfen`;
  const list = names.join(", ");
  const description =
    `Namen erneut prüfen: ${list}. ` +
    "Markenfrei prüft keine Marken; vor Anmeldung oder Nutzung eines Namens gehört eine Markenrecherche dazu. " +
    "Vorprüfung, keine Rechtsberatung.";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Markenfrei//Erinnerung//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@markenfrei`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;VALUE=DATE:${localDate(start)}`,
    `DTEND;VALUE=DATE:${localDate(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `URL:${url}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
