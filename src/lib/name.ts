import { isDomainTld } from "@/lib/engine/sources/domains";

export type NameResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

/**
 * Wandelt Text in Kleinbuchstaben um und schreibt Umlaute aus (ä→ae, ö→oe, ü→ue, ß→ss).
 * Übrige Akzente fallen weg (é→e). Sonderzeichen bleiben erhalten.
 */
export function foldToAscii(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

const MAX_LABEL = 63;

/**
 * Macht aus Benutzereingabe einen gültigen Domain-Namensteil (ohne Endung).
 * Gibt einen Fehlertext zurück, statt den Namen still zu verfälschen.
 */
export function normalizeName(raw: unknown): NameResult {
  let text = foldToAscii(String(raw ?? "").trim());
  if (!text) return { ok: false, error: "Bitte einen Namen eingeben." };

  if (text.includes(".")) {
    const parts = text.split(".");
    const last = parts[parts.length - 1];
    const rest = parts.slice(0, -1).join(".");
    if (!rest.includes(".") && isDomainTld(last)) {
      text = rest;
    } else {
      return {
        ok: false,
        error: "Bitte nur den Namen ohne Punkte eingeben, die Endung wird separat gewählt.",
      };
    }
  }

  const name = text.replace(/[^a-z0-9-]/g, "");
  if (name.length < 2) {
    return { ok: false, error: "Der Name braucht mindestens 2 Zeichen (Buchstaben oder Ziffern)." };
  }
  if (name.length > MAX_LABEL) {
    return { ok: false, error: `Der Name darf höchstens ${MAX_LABEL} Zeichen lang sein.` };
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    return { ok: false, error: "Der Name darf nicht mit einem Bindestrich beginnen oder enden." };
  }
  return { ok: true, name };
}
