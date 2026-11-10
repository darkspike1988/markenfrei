import snapshotFile from "./wikidata-brands.json";
import { buildBrandIndex, compareWithBrands, type BrandEntry, type BrandIndex } from "@/lib/brand-similarity";
import { MAX_MATCHES, type Source, type SourceMatch, type SourceResult } from "@/lib/engine/types";
import { containsCompanies, serializeSnapshot, validateSnapshotText, type Snapshot } from "./wikidata-brands-format";

/**
 * Quelle `wikidata_brands` (Namensraum known_names): Ähnlichkeitsvergleich gegen einen Schnappschuss
 * von Wikidata-Marken (CC0, von Hand erneuert). Kein Netz, kein Markenregister, nie "taken":
 * exakte Gleichheit prüft die Live-Quelle `wikidata`. Nur auf dem Server erreichbar
 * (tests/client-bundle-boundary.test.ts).
 */

const NAMESPACE = "known_names" as const;
const SOURCE_ID = "wikidata_brands";
const LABEL = "Marken (Wikidata-Stand)";

/** Gleiche Regel wie normalizeName: a-z, 0-9, Bindestrich innen, 2 bis 63 Zeichen. */
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;

/** Untergrenze der Einträge; darunter gilt der Schnappschuss als kaputt (offen, siehe Plan). */
export const MIN_SNAPSHOT_ENTRIES = 1000;

/** Was die Quelle zum Vergleichen braucht. */
export type LoadedBrands = { marken: readonly BrandEntry[]; abgerufen: string; enthaelt?: readonly string[] };

export type WikidataBrandsOptions = {
  /** Liefert die Liste (Standard: die echte Datei, mit geprüftem Kopf). Darf null liefern oder werfen. */
  load?: () => LoadedBrands | null | undefined;
  /** Untergrenze der Einträge (Standard: MIN_SNAPSHOT_ENTRIES). */
  minEntries?: number;
  /** Baut den Vergleichsindex (Standard: buildBrandIndex; für Tests ersetzbar, z. B. zum Zählen). */
  buildIndex?: (marken: readonly BrandEntry[]) => BrandIndex;
};

/** Prüft den Kopf der echten Datei und liefert sie, oder wirft mit dem Grund. */
export function loadSnapshotFile(raw: unknown, minEntries = MIN_SNAPSHOT_ENTRIES): LoadedBrands {
  const text = serializeSnapshot(raw as Snapshot);
  const errors = validateSnapshotText(text, { minEntries });
  if (errors.length > 0) throw new Error(errors[0]);
  const s = raw as Snapshot;
  return { marken: s.marken, abgerufen: s.abgerufen, enthaelt: s.enthaelt };
}

/**
 * Die echte Datei ändert sich zur Laufzeit nicht: Kopf und Liste werden einmal geprüft, danach
 * liefert jeder Aufruf dasselbe Objekt (oder denselben Fehler). So wird der Schnappschuss nicht je
 * Abfrage neu serialisiert und geprüft.
 */
let realSnapshot: { ok: LoadedBrands } | { error: unknown } | undefined;

export function loadRealSnapshot(): LoadedBrands {
  let s = realSnapshot;
  if (!s) {
    try {
      s = { ok: loadSnapshotFile(snapshotFile) };
    } catch (error) {
      s = { error };
    }
    realSnapshot = s;
  }
  if ("error" in s) throw s.error;
  return s.ok;
}

/** Deutsche Tausendergruppen ohne Intl (4742 -> "4.742"). */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const UNAVAILABLE = "Schnappschuss nicht verfügbar, nicht geprüft";

function tmviewUrl(term: string): string {
  return `https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=${encodeURIComponent(term)}`;
}

/** "Marken" bzw. "Marken- und Firmennamen", je nach Feld `enthaelt` im Dateikopf (ohne Feld: Marken). */
export function nounFor(enthaelt: unknown): string {
  return containsCompanies(enthaelt) ? "Marken- und Firmennamen" : "Marken";
}

/** Kurzbeschreibung mit Stand und Anzahl aus dem Dateikopf (nicht als feste Zahl im Code). */
export function describeSnapshot(abgerufen: unknown, anzahl: number, enthaelt: unknown): string {
  const stand = typeof abgerufen === "string" ? abgerufen : "unbekannt";
  return (
    `Ähnlichkeitsvergleich ohne Netz gegen einen Schnappschuss von ${groupThousands(anzahl)} ${nounFor(enthaelt)} aus Wikidata (CC0, Stand ${stand}): gleich, klanggleich, schreibähnlich oder an einer Wortgrenze enthalten. ` +
    `Die Liste ist unvollständig und kein Markenregister; ein Treffer ist nur ein Hinweis (gelb, nie rot), kein Treffer ist keine Freigabe.`
  );
}

function describe(): string {
  const n = Array.isArray(snapshotFile.marken) ? snapshotFile.marken.length : 0;
  return describeSnapshot(snapshotFile.abgerufen, n, (snapshotFile as { enthaelt?: unknown }).enthaelt);
}

export function createWikidataBrandsSource(opts: WikidataBrandsOptions = {}): Source {
  const load = opts.load ?? loadRealSnapshot;
  const minEntries = opts.minEntries ?? MIN_SNAPSHOT_ENTRIES;
  const buildIndex = opts.buildIndex ?? buildBrandIndex;
  // Der Index hängt nur an der Liste: gebunden an deren Identität, damit auch ein Lader, der je Aufruf
  // ein neues Objekt um dieselbe Liste liefert, nicht jedes Mal einen neuen Index bauen lässt.
  let cache: { marken: readonly BrandEntry[]; index: BrandIndex } | undefined;

  function prepare(): { loaded: LoadedBrands; index: BrandIndex } | null {
    const loaded = load();
    if (!loaded || !Array.isArray(loaded.marken) || loaded.marken.length < minEntries) return null;
    if (typeof loaded.abgerufen !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(loaded.abgerufen)) return null;
    if (cache && cache.marken === loaded.marken) return { loaded, index: cache.index };
    const index = buildIndex(loaded.marken);
    if (index.size < minEntries) return null;
    cache = { marken: loaded.marken, index };
    return { loaded, index };
  }

  return {
    id: SOURCE_ID,
    namespace: NAMESPACE,
    label: LABEL,
    defaultEnabled: false,
    description: describe(),
    endpoint: "offline:wikidata-brands.json",
    async check(name) {
      const base = { sourceId: SOURCE_ID, label: LABEL, target: name };
      const res = (status: SourceResult["status"], extra: Partial<SourceResult> = {}): SourceResult => ({
        ...base,
        namespace: NAMESPACE,
        status,
        ...extra,
      });
      if (!NAME_RE.test(name)) {
        return res("invalid", { note: "Name ungültig (erlaubt: a-z, 0-9, Bindestrich, 2 bis 63 Zeichen)" });
      }
      try {
        const ready = prepare();
        if (!ready) return res("unknown", { note: UNAVAILABLE });
        const { loaded, index } = ready;
        const hint = name.replace(/-/g, "").length < 4 ? "; nur auf Gleichheit geprüft (unter 4 Zeichen)" : "";
        const r = compareWithBrands(name, index, loaded.abgerufen);
        if (r.hits.length === 0) {
          return res("not_found", {
            note:
              `Kein ähnlicher Eintrag unter ${groupThousands(index.size)} ${nounFor(loaded.enthaelt)} aus Wikidata (Stand ${loaded.abgerufen}). ` +
              `Die Liste ist unvollständig: Viele bekannte Marken sind dort nicht als Marke geführt. ` +
              `Kein Markenregister, keine Freigabe.` +
              (hint ? ` Nur auf Gleichheit geprüft (unter 4 Zeichen).` : ""),
          });
        }
        return res("similar", {
          url: r.url ?? tmviewUrl(r.hits[0].label),
          note: (r.note ?? "Ähnlicher Eintrag in Wikidata") + hint,
          evidence: r.evidence,
          matches: r.hits.slice(0, MAX_MATCHES).map(
            (h): SourceMatch => ({ label: h.label, kind: h.kind, ...(h.id ? { id: h.id } : {}) }),
          ),
        });
      } catch {
        return res("unknown", { note: UNAVAILABLE });
      }
    },
  };
}

export const wikidataBrands: Source = createWikidataBrandsSource();
