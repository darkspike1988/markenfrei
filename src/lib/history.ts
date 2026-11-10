import type { Status } from "@/lib/engine/types";

/**
 * Verlauf „Zuletzt geprüft“: nur im Browser, nur wenn eingeschaltet. Gespeichert wird je Prüfung der
 * Query-Teil des Links (Namen und Auswahl, wie ihn `buildQuery` erzeugt), der Zeitpunkt und, sobald die
 * Prüfung fertig ist, je Name und Quelle der Status (`results`), höchstens MAX_HISTORY Einträge unter
 * HISTORY_KEY. Der Eintrag existiert nur, solange der Verlauf eingeschaltet ist; Ausschalten löscht ihn.
 * Nichts davon erreicht den Server.
 *
 * Rein (ohne Browser-APIs), damit sich Lesen und Fortschreiben mit node:test prüfen lassen.
 */
export const HISTORY_KEY = "markenfrei:history";
export const MAX_HISTORY = 12;

/** Obergrenze je Eintrag: ein Link mit zehn langen Namen und allen Optionen bleibt weit darunter. */
const MAX_QUERY_LENGTH = 2000;

/** Obergrenzen eines gespeicherten Ergebnisses: so viele Namen wie eine Prüfung, Quellen je Name. */
export const MAX_SNAPSHOT_NAMES = 10;
export const MAX_SNAPSHOT_SOURCES = 120;
/** Längste zulässige Namen und Quellen-IDs (Namen haben höchstens 63 Zeichen) */
const MAX_KEY_LENGTH = 100;

/** Kurzform eines Status im Speicher; ein angehängtes „w“ heißt schwacher Treffer. */
const STATUS_CODE: Record<Status, string> = {
  taken: "t",
  not_found: "n",
  similar: "s",
  invalid: "i",
  unknown: "u",
};
const CODE_STATUS = new Map(Object.entries(STATUS_CODE).map(([status, code]) => [code, status as Status]));

/** Status einer Quelle, wie ihn Verlauf und Vergleich kennen. */
export type SourceState = { status: Status; weak: boolean };

/** Gespeichertes Ergebnis: je geprüftem Namen je Quellen-ID der Kurzcode (z. B. `n`, `t`, `tw`). */
export type HistorySnapshot = Record<string, Record<string, string>>;

export type HistoryEntry = {
  /** Query-Teil des Links ohne „?“, z. B. `q=wachwerk,planzeit&tld=de,com` */
  query: string;
  /** Zeitpunkt der Prüfung (ISO 8601) */
  at: string;
  /** Ergebnis der Prüfung; fehlt bei älteren Einträgen und solange die Prüfung läuft */
  results?: HistorySnapshot;
};

export function encodeState(state: SourceState): string {
  return STATUS_CODE[state.status] + (state.weak ? "w" : "");
}

/** Liest einen Kurzcode; `null` bei allem, was nicht genau so geschrieben wird. */
export function decodeState(code: string): SourceState | null {
  const status = CODE_STATUS.get(code.endsWith("w") ? code.slice(0, -1) : code);
  if (!status) return null;
  return { status, weak: code.length === 2 && code.endsWith("w") };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_KEY_LENGTH;
}

/** Prüft ein gespeichertes Ergebnis; zu groß, fremde Codes oder falsche Form ergeben `null`. */
export function parseSnapshot(value: unknown): HistorySnapshot | null {
  if (!isPlainObject(value)) return null;
  const names = Object.entries(value);
  if (names.length === 0 || names.length > MAX_SNAPSHOT_NAMES) return null;
  const out: HistorySnapshot = {};
  for (const [name, rows] of names) {
    if (!validKey(name) || !isPlainObject(rows)) return null;
    const entries = Object.entries(rows);
    if (entries.length > MAX_SNAPSHOT_SOURCES) return null;
    const kept: Record<string, string> = {};
    for (const [id, code] of entries) {
      if (!validKey(id) || typeof code !== "string" || !decodeState(code)) return null;
      kept[id] = code;
    }
    out[name] = kept;
  }
  return out;
}

function readEntry(value: unknown): HistoryEntry | null {
  if (!isPlainObject(value)) return null;
  const { query, at, results } = value;
  if (
    typeof query !== "string" ||
    query.length === 0 ||
    query.length > MAX_QUERY_LENGTH ||
    typeof at !== "string" ||
    Number.isNaN(Date.parse(at))
  ) {
    return null;
  }
  // Ein unbrauchbares Ergebnis fällt weg, der Eintrag bleibt.
  const snapshot = results === undefined ? null : parseSnapshot(results);
  return snapshot ? { query, at, results: snapshot } : { query, at };
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
  return data
    .map(readEntry)
    .filter((e): e is HistoryEntry => e !== null)
    .slice(0, MAX_HISTORY);
}

/**
 * Setzt die Prüfung an den Anfang; dieselbe Auswahl steht danach nur einmal in der Liste. Der neue Eintrag
 * hat noch kein Ergebnis; das alte gehört zum alten Zeitpunkt und fällt mit ihm weg.
 */
export function addHistory(entries: readonly HistoryEntry[], query: string, at: string): HistoryEntry[] {
  if (!readEntry({ query, at })) return [...entries];
  return [{ query, at }, ...entries.filter((e) => e.query !== query)].slice(0, MAX_HISTORY);
}

/** Legt das Ergebnis im Eintrag mit dieser Auswahl ab. Ohne solchen Eintrag oder bei ungültigem Ergebnis ändert sich nichts. */
export function setHistoryResults(
  entries: readonly HistoryEntry[],
  query: string,
  results: HistorySnapshot,
): HistoryEntry[] {
  const snapshot = parseSnapshot(results);
  if (!snapshot) return [...entries];
  return entries.map((e) => (e.query === query ? { ...e, results: snapshot } : e));
}

/** Namen eines Eintrags für die Anzeige (aus `q=`), ohne die Auswahl auszuwerten. */
export function historyNames(entry: HistoryEntry): string[] {
  return (new URLSearchParams(entry.query).get("q") ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * Kompaktes Ergebnis aus fertigen Berichten, in deren Reihenfolge. Über die Obergrenzen hinaus wird gekürzt.
 */
export function snapshotFromReports(
  reports: readonly { name: string; results: readonly { sourceId: string; status: Status; weak?: boolean }[] }[],
): HistorySnapshot {
  const out: HistorySnapshot = {};
  for (const report of reports.slice(0, MAX_SNAPSHOT_NAMES)) {
    if (!validKey(report.name) || out[report.name]) continue;
    const rows: Record<string, string> = {};
    for (const r of report.results) {
      if (Object.keys(rows).length >= MAX_SNAPSHOT_SOURCES) break;
      if (!validKey(r.sourceId) || rows[r.sourceId]) continue;
      rows[r.sourceId] = encodeState({ status: r.status, weak: r.weak === true });
    }
    out[report.name] = rows;
  }
  return out;
}

export type SnapshotChange = { name: string; sourceId: string; from: SourceState; to: SourceState };

/**
 * Was sich zwischen zwei Ergebnissen geändert hat, je Name und Quelle in der Reihenfolge von `current`.
 * Quellen, die auf einer Seite „unbekannt“ sind (keine Antwort ist keine Änderung) oder nur auf einer Seite
 * vorkommen, zählen nicht; ebenso Namen, die nur auf einer Seite vorkommen.
 */
export function diffSnapshots(previous: HistorySnapshot, current: HistorySnapshot): SnapshotChange[] {
  const changes: SnapshotChange[] = [];
  for (const [name, rows] of Object.entries(current)) {
    const before = Object.hasOwn(previous, name) ? previous[name] : undefined;
    if (!before) continue;
    for (const [sourceId, code] of Object.entries(rows)) {
      if (!Object.hasOwn(before, sourceId) || before[sourceId] === code) continue;
      const from = decodeState(before[sourceId]);
      const to = decodeState(code);
      if (!from || !to || from.status === "unknown" || to.status === "unknown") continue;
      // Das Kennzeichen „schwach“ wirkt nur bei „vergeben“; sonst ist es keine Änderung.
      if (from.status === to.status && (to.status !== "taken" || from.weak === to.weak)) continue;
      changes.push({ name, sourceId, from, to });
    }
  }
  return changes;
}
