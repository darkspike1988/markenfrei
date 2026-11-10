/**
 * Verlauf „Zuletzt geprüft“: nur im Browser, nur wenn eingeschaltet. Gespeichert wird je Prüfung der
 * Query-Teil des Links (Namen und Auswahl, wie ihn `buildQuery` erzeugt) und der Zeitpunkt, höchstens
 * MAX_HISTORY Einträge unter HISTORY_KEY. Der Eintrag existiert nur, solange der Verlauf eingeschaltet ist;
 * Ausschalten löscht ihn. Nichts davon erreicht den Server.
 *
 * Rein (ohne Browser-APIs), damit sich Lesen und Fortschreiben mit node:test prüfen lassen.
 */
export const HISTORY_KEY = "markenfrei:history";
export const MAX_HISTORY = 12;

/** Obergrenze je Eintrag: ein Link mit zehn langen Namen und allen Optionen bleibt weit darunter. */
const MAX_QUERY_LENGTH = 2000;

export type HistoryEntry = {
  /** Query-Teil des Links ohne „?“, z. B. `q=wachwerk,planzeit&tld=de,com` */
  query: string;
  /** Zeitpunkt der Prüfung (ISO 8601) */
  at: string;
};

function isEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const { query, at } = value as Record<string, unknown>;
  return (
    typeof query === "string" &&
    query.length > 0 &&
    query.length <= MAX_QUERY_LENGTH &&
    typeof at === "string" &&
    !Number.isNaN(Date.parse(at))
  );
}

/**
 * Liest den gespeicherten Text. `null` heißt: Verlauf aus (kein Eintrag). Ein kaputter oder fremder
 * Inhalt ergibt eine leere Liste statt eines Fehlers; unbrauchbare Einträge fallen weg.
 */
export function parseHistory(raw: string | null): HistoryEntry[] | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.filter(isEntry).slice(0, MAX_HISTORY);
}

/** Setzt die Prüfung an den Anfang; dieselbe Auswahl steht danach nur einmal in der Liste. */
export function addHistory(entries: readonly HistoryEntry[], query: string, at: string): HistoryEntry[] {
  if (!isEntry({ query, at })) return [...entries];
  return [{ query, at }, ...entries.filter((e) => e.query !== query)].slice(0, MAX_HISTORY);
}

/** Namen eines Eintrags für die Anzeige (aus `q=`), ohne die Auswahl auszuwerten. */
export function historyNames(entry: HistoryEntry): string[] {
  return (new URLSearchParams(entry.query).get("q") ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}
