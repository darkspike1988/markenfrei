import { NAMESPACES, type Namespace, type SourceResult, type Status } from "@/lib/engine/types";
import { computeVerdict, type Verdict } from "@/lib/engine/verdict";

/**
 * „Stand kopieren“: ein fertiges Ergebnis als Teil hinter `#stand=` im Link. Der Teil hinter „#“ geht nie
 * an den Server; wer den Link öffnet, sieht das Ergebnis, wie es war, ohne neue Abfrage.
 *
 * Form (Version 1), als JSON: `{"v":1,"t":"<ISO-Zeitpunkt>","n":[["wachwerk",[["rdap:de","not_found",0],…]],…]}`,
 * komprimiert mit `CompressionStream("deflate-raw")` und base64url-kodiert. Lesen prüft streng (Version,
 * Größen, bekannte Status, Längen) und gibt bei allem anderen `null` zurück.
 *
 * Rein bis auf die Streams, die Browser und Node gleichermaßen haben; fehlen sie, gibt es die Funktion nicht.
 */

export const SNAPSHOT_FRAGMENT = "stand";
const VERSION = 1;

export const MAX_SHARED_NAMES = 10;
export const MAX_SHARED_ROWS = 120;
/** Längste Namen und Quellen-IDs (Namen haben höchstens 63 Zeichen) */
const MAX_STRING = 100;
/** Obergrenzen vor und nach dem Entpacken, damit ein manipulierter Link nichts aufbläht */
export const MAX_FRAGMENT_LENGTH = 32_000;
const MAX_JSON_BYTES = 120_000;

const STATUSES: readonly Status[] = ["taken", "not_found", "similar", "invalid", "unknown"];

/** Eine Zeile: Quellen-ID, Status, schwacher Treffer. */
export type SharedRow = [sourceId: string, status: Status, weak: boolean];

export type SharedSnapshot = {
  /** Zeitpunkt der Prüfung (ISO 8601) */
  at: string;
  names: { name: string; rows: SharedRow[] }[];
};

/** Kann dieser Browser (oder diese Node-Version) Links mit Stand schreiben und lesen? */
export function snapshotLinkSupported(): boolean {
  if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") return false;
  try {
    new CompressionStream("deflate-raw");
    new DecompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
}

/** Baut den Stand aus fertigen Berichten, gekürzt auf die Obergrenzen. */
export function sharedFromReports(
  reports: readonly { name: string; results: readonly { sourceId: string; status: Status; weak?: boolean }[] }[],
  at: string,
): SharedSnapshot {
  return {
    at,
    names: reports.slice(0, MAX_SHARED_NAMES).map((r) => ({
      name: r.name,
      rows: r.results.slice(0, MAX_SHARED_ROWS).map((x): SharedRow => [x.sourceId, x.status, x.weak === true]),
    })),
  };
}

/** Zeile der Ansicht eines geteilten Stands: Beschriftung aus der Konfiguration, sonst die ID. */
export type SharedRowView = { id: string; label: string; status: Status; weak: boolean };

/** Gruppe je Namensraum; `ns: null` sammelt Quellen, die die Konfiguration nicht kennt. */
export type SharedGroup = { ns: Namespace | null; rows: SharedRowView[] };

/**
 * Ordnet die Zeilen eines geteilten Namens nach Namensraum (feste Reihenfolge, unbekannte IDs zuletzt).
 * Domains (`rdap:<tld>`, `dns:<tld>`) heißen `.tld`, andere Quellen wie in `sources`.
 */
export function groupSharedRows(
  rows: readonly SharedRow[],
  sources: readonly { id: string; label: string; namespace: Namespace }[],
): SharedGroup[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const groups = new Map<Namespace | null, SharedRowView[]>();
  for (const [id, status, weak] of rows) {
    const tld = /^(?:rdap|dns):([a-z0-9.-]+)$/.exec(id)?.[1];
    const source = byId.get(id);
    const ns = tld ? "domains" : (source?.namespace ?? null);
    const label = tld ? `.${tld}` : (source?.label ?? id);
    groups.set(ns, [...(groups.get(ns) ?? []), { id, label, status, weak }]);
  }
  return [...NAMESPACES, null].filter((ns) => groups.has(ns)).map((ns) => ({ ns, rows: groups.get(ns)! }));
}

/** Ampel eines geteilten Namens nach derselben Regel wie im Bericht; dafür zählen nur Status und „schwach“. */
export function sharedVerdict(rows: readonly SharedRow[]): Verdict {
  return computeVerdict(
    rows.map(
      ([sourceId, status, weak]): SourceResult => ({ sourceId, status, weak, namespace: "known_names", label: sourceId, target: sourceId }),
    ),
  );
}

function validString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_STRING;
}

/**
 * Prüft die entpackte Form streng: Version, Zeitpunkt, höchstens MAX_SHARED_NAMES Namen mit je höchstens
 * MAX_SHARED_ROWS Zeilen, keine doppelten Namen oder Quellen, nur bekannte Status. Sonst `null`.
 */
export function parseShared(data: unknown): SharedSnapshot | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { v, t, n } = data as Record<string, unknown>;
  if (v !== VERSION || typeof t !== "string" || t.length > 40 || Number.isNaN(Date.parse(t))) return null;
  if (!Array.isArray(n) || n.length === 0 || n.length > MAX_SHARED_NAMES) return null;
  const names: SharedSnapshot["names"] = [];
  const seenNames = new Set<string>();
  for (const entry of n) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [name, rows] = entry as unknown[];
    if (!validString(name) || seenNames.has(name)) return null;
    if (!Array.isArray(rows) || rows.length > MAX_SHARED_ROWS) return null;
    seenNames.add(name);
    const seenIds = new Set<string>();
    const out: SharedRow[] = [];
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 3) return null;
      const [id, status, weak] = row as unknown[];
      if (!validString(id) || seenIds.has(id)) return null;
      if (!STATUSES.includes(status as Status) || (weak !== 0 && weak !== 1)) return null;
      seenIds.add(id);
      out.push([id, status as Status, weak === 1]);
    }
    names.push({ name, rows: out });
  }
  return { at: new Date(t).toISOString(), names };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  let binary: string;
  try {
    binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Liest einen Stream vollständig, bricht aber ab (null), sobald mehr als `max` Bytes kommen. */
async function readAll(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
  max: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Schreibt den Stand als Text für `#stand=` (base64url). */
export async function encodeShared(snapshot: SharedSnapshot): Promise<string> {
  const json = JSON.stringify({
    v: VERSION,
    t: snapshot.at,
    n: snapshot.names.map((e) => [e.name, e.rows.map(([id, status, weak]) => [id, status, weak ? 1 : 0])]),
  });
  const stream = new Blob([new TextEncoder().encode(json)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = await readAll(stream, Number.MAX_SAFE_INTEGER);
  return toBase64Url(bytes ?? new Uint8Array());
}

/** Liest den Text hinter `#stand=`; alles Ungültige, zu Große oder Manipulierte ergibt `null`. */
export async function decodeShared(text: string): Promise<SharedSnapshot | null> {
  if (text.length === 0 || text.length > MAX_FRAGMENT_LENGTH || !snapshotLinkSupported()) return null;
  const bytes = fromBase64Url(text);
  if (!bytes) return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const raw = await readAll(stream, MAX_JSON_BYTES);
    if (!raw) return null;
    return parseShared(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)));
  } catch {
    return null;
  }
}

/** Daten aus einem Fragment wie `#stand=…`; `null`, wenn es kein Stand ist. */
export function sharedFromHash(hash: string): string | null {
  const prefix = `#${SNAPSHOT_FRAGMENT}=`;
  return hash.startsWith(prefix) ? hash.slice(prefix.length) : null;
}

/** Adresse mit `#stand=<daten>` statt eines bisherigen Fragments. */
export function withSharedFragment(href: string, data: string): string {
  return `${href.split("#")[0]}#${SNAPSHOT_FRAGMENT}=${data}`;
}
