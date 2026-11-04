import type { ShortlistEntry } from "@/lib/engine/verdict";

/**
 * Ehrliche Texte für die Rangliste (reine Funktionen, ohne React): „vergeben“ und
 * „nicht zulässig“ werden getrennt benannt, „frei“ wird nie behauptet.
 */

/** Eine Zeile Begründung je Eintrag der Rangliste. */
export function shortlistSummary(entry: ShortlistEntry): string {
  if (entry.freeInAll) return "in allen gewählten Quellen nicht gefunden";
  const parts: string[] = [];
  if (entry.taken.length) parts.push(`vergeben: ${entry.taken.join(", ")}`);
  if (entry.invalid.length) parts.push(`nicht zulässig: ${entry.invalid.join(", ")}`);
  if (entry.unknown.length) parts.push(`ohne Antwort: ${entry.unknown.join(", ")}`);
  return parts.join(" · ") || "ähnliche oder schwache Treffer prüfen";
}

/** Zähler über der Rangliste. Vor dem ersten Ergebnis kein „0 Namen …“. */
export function shortlistCount(ranking: ShortlistEntry[], pending: number): string {
  if (ranking.length === 0) return pending > 0 ? "Prüfung läuft …" : "Noch kein Ergebnis";
  const n = ranking.filter((e) => e.freeInAll).length;
  const text = `${n === 1 ? "1 Name" : `${n} Namen`} ohne Treffer in allen gewählten Quellen`;
  return pending > 0 ? `Bisher ${text}` : text;
}
