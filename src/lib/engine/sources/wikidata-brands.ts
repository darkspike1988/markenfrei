import snapshotFile from "./wikidata-brands.json";
import { buildBrandIndex, compareWithBrands, type BrandEntry, type BrandIndex } from "@/lib/brand-similarity";
import type { Source, SourceResult } from "@/lib/engine/types";
import { serializeSnapshot, validateSnapshotText, type Snapshot } from "./wikidata-brands-format";

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
export type LoadedBrands = { marken: readonly BrandEntry[]; abgerufen: string };

export type WikidataBrandsOptions = {
  /** Liefert die Liste (Standard: die echte Datei, mit geprüftem Kopf). Darf null liefern oder werfen. */
  load?: () => LoadedBrands | null | undefined;
  /** Untergrenze der Einträge (Standard: MIN_SNAPSHOT_ENTRIES). */
  minEntries?: number;
};

/** Prüft den Kopf der echten Datei und liefert sie, oder wirft mit dem Grund. */
export function loadSnapshotFile(raw: unknown, minEntries = MIN_SNAPSHOT_ENTRIES): LoadedBrands {
  const text = serializeSnapshot(raw as Snapshot);
  const errors = validateSnapshotText(text, { minEntries });
  if (errors.length > 0) throw new Error(errors[0]);
  const s = raw as Snapshot;
  return { marken: s.marken, abgerufen: s.abgerufen };
}

const loadReal = (): LoadedBrands => loadSnapshotFile(snapshotFile);

/** Deutsche Tausendergruppen ohne Intl (4742 -> "4.742"). */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const UNAVAILABLE = "Schnappschuss nicht verfügbar, nicht geprüft";

function tmviewUrl(term: string): string {
  return `https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=${encodeURIComponent(term)}`;
}

/** Kurzbeschreibung mit Stand und Anzahl aus dem Dateikopf (nicht als feste Zahl im Code). */
function describe(): string {
  const stand = typeof snapshotFile.abgerufen === "string" ? snapshotFile.abgerufen : "unbekannt";
  const n = Array.isArray(snapshotFile.marken) ? snapshotFile.marken.length : 0;
  return (
    `Ähnlichkeitsvergleich ohne Netz gegen einen Schnappschuss von ${groupThousands(n)} Marken aus Wikidata (CC0, Stand ${stand}): gleich, klanggleich, schreibähnlich oder an einer Wortgrenze enthalten. ` +
    `Die Liste ist unvollständig und kein Markenregister; ein Treffer ist nur ein Hinweis (gelb, nie rot), kein Treffer ist keine Freigabe.`
  );
}

export function createWikidataBrandsSource(opts: WikidataBrandsOptions = {}): Source {
  const load = opts.load ?? loadReal;
  const minEntries = opts.minEntries ?? MIN_SNAPSHOT_ENTRIES;
  let cache: { loaded: LoadedBrands; index: BrandIndex } | undefined;

  function prepare(): { loaded: LoadedBrands; index: BrandIndex } | null {
    const loaded = load();
    if (!loaded || !Array.isArray(loaded.marken) || loaded.marken.length < minEntries) return null;
    if (typeof loaded.abgerufen !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(loaded.abgerufen)) return null;
    if (cache && cache.loaded === loaded) return cache;
    const index = buildBrandIndex(loaded.marken);
    if (index.size < minEntries) return null;
    cache = { loaded, index };
    return cache;
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
              `Kein ähnlicher Eintrag unter ${groupThousands(index.size)} Marken aus Wikidata (Stand ${loaded.abgerufen}). ` +
              `Die Liste ist unvollständig: Viele bekannte Marken sind dort nicht als Marke geführt. ` +
              `Kein Markenregister, keine Freigabe.` +
              (hint ? ` Nur auf Gleichheit geprüft (unter 4 Zeichen).` : ""),
          });
        }
        return res("similar", {
          url: r.url ?? tmviewUrl(r.hits[0].label),
          note: (r.note ?? "Ähnlicher Eintrag in Wikidata") + hint,
          evidence: r.evidence,
        });
      } catch {
        return res("unknown", { note: UNAVAILABLE });
      }
    },
  };
}

export const wikidataBrands: Source = createWikidataBrandsSource();
