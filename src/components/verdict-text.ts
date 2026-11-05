import type { ShortlistEntry } from "@/lib/engine/verdict";
import type { SourceResult, Status } from "@/lib/engine/types";

/**
 * Ehrliche Texte für die Ergebnisliste (reine Funktionen, ohne React): „vergeben“ und
 * „nicht zulässig“ werden getrennt benannt, „frei“ wird nie behauptet.
 */

const MAX_LISTED = 4;

/** Höchstens vier Namen, der Rest als „+N“, damit die Begründung einzeilig bleibt. */
function listed(items: string[]): string {
  if (items.length <= MAX_LISTED) return items.join(", ");
  return `${items.slice(0, MAX_LISTED).join(", ")} +${items.length - MAX_LISTED}`;
}

/** Eine Zeile Begründung je Eintrag der Ergebnisliste. */
export function shortlistSummary(entry: ShortlistEntry): string {
  if (entry.freeInAll) return "in allen Quellen nicht gefunden";
  const parts: string[] = [];
  if (entry.taken.length) parts.push(`vergeben: ${listed(entry.taken)}`);
  if (entry.invalid.length) parts.push(`nicht zulässig: ${listed(entry.invalid)}`);
  if (entry.unknown.length) parts.push(`${entry.unknown.length} ohne Antwort`);
  return parts.join(" · ") || "ähnliche oder schwache Treffer prüfen";
}

/** Zähler über der Ergebnisliste. Vor dem ersten Ergebnis kein „0 Namen …“. */
export function shortlistCount(ranking: ShortlistEntry[], pending: number): string {
  if (ranking.length === 0) return pending > 0 ? "Prüfung läuft …" : "Noch kein Ergebnis";
  const n = ranking.filter((e) => e.freeInAll).length;
  const text = `${n === 1 ? "1 Name" : `${n} Namen`} ohne Treffer in allen gewählten Quellen`;
  return pending > 0 ? `Bisher ${text}` : text;
}

export type GroupNotes = {
  /** Hinweise, die mehrere Zeilen mit gleichem Status teilen: einmal unter der Gruppenüberschrift */
  shared: { status: Status; note: string }[];
  /** Hinweis je Quelle (sourceId), sichtbar in der Zeile: vergeben, ähnlich, nicht zulässig, unbekannt */
  inline: Map<string, string>;
  /** Hinweise zu „nicht gefunden“, standardmäßig verborgen und per Schalter erreichbar */
  hidden: { labels: string[]; note: string }[];
};

/**
 * Verteilt die Hinweise einer Quellengruppe: zu „nicht gefunden“ nur auf Abruf, alles andere
 * sichtbar, gleichlautende Hinweise (typisch bei Domains) nur einmal. Es geht kein Hinweis verloren.
 */
export function groupNotes(rows: SourceResult[]): GroupNotes {
  const count = new Map<string, number>();
  const key = (r: SourceResult) => `${r.status}\u0000${r.note}`;
  for (const r of rows) {
    if (r.note && r.status !== "not_found") count.set(key(r), (count.get(key(r)) ?? 0) + 1);
  }

  const shared: GroupNotes["shared"] = [];
  const inline = new Map<string, string>();
  const hiddenByNote = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.note) continue;
    if (r.status === "not_found") {
      hiddenByNote.set(r.note, [...(hiddenByNote.get(r.note) ?? []), r.label]);
    } else if ((count.get(key(r)) ?? 0) > 1) {
      if (!shared.some((s) => s.status === r.status && s.note === r.note)) shared.push({ status: r.status, note: r.note });
    } else {
      inline.set(r.sourceId, r.note);
    }
  }
  const hidden = [...hiddenByNote.entries()].map(([note, labels]) => ({ labels, note }));
  return { shared, inline, hidden };
}

/** „Alle:“ nur, wenn ein einziger Hinweis für mehrere Quellen gilt; sonst Quellen vorweg. */
export function hiddenNoteLead(h: GroupNotes["hidden"][number], total: number): string {
  return total === 1 && h.labels.length > 1 ? "Alle" : h.labels.join(", ");
}
