import { koelnerPhonetik, levenshtein } from "@/lib/phonetics";

/**
 * Reiner Ähnlichkeitsvergleich eines Namens gegen eine Markenliste (z. B. aus Wikidata).
 * Keine Dateizugriffe, kein Netz: Die Liste kommt als Parameter herein.
 * Ein fehlender Treffer ist keine Freigabe; das Ergebnis ist nur ein Hinweis.
 */

/** [key, label, Wikidata-IDs]. key: kleingeschrieben, ohne Bindestriche (Vergleichsform). */
export type BrandEntry = readonly [key: string, label: string, ids: readonly string[]];

export type SimilarityKind = "gleich" | "klanggleich" | "schreibaehnlich" | "enthalten";

export type BrandHit = {
  rank: 0 | 1 | 2 | 3;
  kind: SimilarityKind;
  key: string;
  label: string;
  /** Wikidata-ID (leer bei Einträgen ohne ID). */
  id: string;
  code: string;
  distance: number;
};

export type SimilarityResult = {
  /** Sortiert nach Rang, dann Levenshtein, dann Schlüssel, dann ID. */
  hits: BrandHit[];
  /** Anzahl Treffer insgesamt (je Wikidata-ID einer). */
  total: number;
  url?: string;
  note?: string;
  evidence?: string;
};

export type BrandIndex = {
  byKey: Map<string, BrandEntry>;
  byCode: Map<string, BrandEntry[]>;
  byLength: Map<number, BrandEntry[]>;
  size: number;
};

export const MAX_EVIDENCE = 5;
export const GENERIC_THRESHOLD = 20;

/** Kopie von containsAtBoundary aus known-names.ts (dort nicht exportiert): Marke steht am Anfang/Ende oder grenzt an einen Bindestrich. */
function containsAtBoundary(name: string, brand: string): boolean {
  let from = 0;
  for (;;) {
    const i = name.indexOf(brand, from);
    if (i < 0) return false;
    const end = i + brand.length;
    const leftBoundary = i === 0 || name[i - 1] === "-";
    const rightBoundary = end === name.length || name[end] === "-";
    if (leftBoundary || rightBoundary) return true;
    from = i + 1;
  }
}

/** Kopie von tmviewUrl aus known-names.ts (dort nicht exportiert). */
function tmviewUrl(term: string): string {
  return `https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=${encodeURIComponent(term)}`;
}

function push<K, V>(map: Map<K, V[]>, k: K, v: V): void {
  const list = map.get(k);
  if (list) list.push(v);
  else map.set(k, [v]);
}

/** Baut beim Laden die Indizes: Kölner-Code → Einträge und Länge → Einträge. */
export function buildBrandIndex(marken: readonly BrandEntry[]): BrandIndex {
  const index: BrandIndex = { byKey: new Map(), byCode: new Map(), byLength: new Map(), size: 0 };
  for (const entry of marken) {
    const key = entry[0];
    if (!key) continue;
    const existing = index.byKey.get(key);
    if (existing) {
      // Gleicher Schlüssel zweimal: IDs zusammenführen, nichts verlieren.
      index.byKey.set(key, [key, existing[1], [...new Set([...existing[2], ...entry[2]])]]);
    } else {
      index.byKey.set(key, entry);
    }
  }
  for (const entry of index.byKey.values()) {
    const code = koelnerPhonetik(entry[0]);
    if (code.length >= 4) push(index.byCode, code, entry);
    push(index.byLength, entry[0].length, entry);
    index.size++;
  }
  return index;
}

/** Bester Rang eines Namens gegen einen Marken-Schlüssel, oder null. */
function classify(
  compact: string,
  name: string,
  code: string,
  key: string,
  keyCode: string,
): { rank: 0 | 1 | 2 | 3; distance: number } | null {
  if (compact === key) return { rank: 0, distance: 0 };
  const distance = levenshtein(compact, key);
  // Unter 4 Zeichen zählt nur Gleichheit.
  if (compact.length >= 4 && key.length >= 4 && code.length >= 4 && code === keyCode && distance <= 2) {
    return { rank: 1, distance };
  }
  if (
    compact.length >= 5 &&
    key.length >= 5 &&
    Math.abs(compact.length - key.length) <= 2 &&
    distance <= (Math.min(compact.length, key.length) >= 8 ? 2 : 1)
  ) {
    return { rank: 2, distance };
  }
  if (key.length >= 5 && containsAtBoundary(name, key)) return { rank: 3, distance };
  return null;
}

const KIND: Record<0 | 1 | 2 | 3, SimilarityKind> = {
  0: "gleich",
  1: "klanggleich",
  2: "schreibaehnlich",
  3: "enthalten",
};

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareHits(a: BrandHit, b: BrandHit): number {
  return a.rank - b.rank || a.distance - b.distance || cmp(a.key, b.key) || cmp(a.id, b.id);
}

/**
 * Vergleicht einen (bereits normalisierten, kleingeschriebenen) Namen mit der Markenliste.
 * Je Wikidata-ID zählt nur der beste Treffer. `abgerufen` ist das Stand-Datum der Liste.
 */
export function compareWithBrands(name: string, index: BrandIndex, abgerufen?: string): SimilarityResult {
  const empty: SimilarityResult = { hits: [], total: 0 };
  const compact = name.replace(/-/g, "");
  if (compact.length < 2) return empty;
  const code = koelnerPhonetik(compact);

  // Kandidaten über die Indizes, nicht gegen alle Marken.
  const candidates = new Map<string, BrandEntry>();
  const exact = index.byKey.get(compact);
  if (exact) candidates.set(exact[0], exact);
  if (compact.length >= 4 && code.length >= 4) {
    for (const e of index.byCode.get(code) ?? []) candidates.set(e[0], e);
  }
  if (compact.length >= 5) {
    for (let len = compact.length - 2; len <= compact.length + 2; len++) {
      for (const e of index.byLength.get(len) ?? []) candidates.set(e[0], e);
    }
  }
  // Enthalten: nur Teilstrings an Wortgrenzen (Anfang, Ende, Bindestrich) kommen als Schlüssel in Frage.
  for (let i = 0; i < name.length; i++) {
    for (let end = i + 5; end <= name.length; end++) {
      const atBoundary = i === 0 || name[i - 1] === "-" || end === name.length || name[end] === "-";
      if (!atBoundary) continue;
      const e = index.byKey.get(name.slice(i, end));
      if (e) candidates.set(e[0], e);
    }
  }

  const best = new Map<string, BrandHit>();
  for (const e of candidates.values()) {
    const [key, label, ids] = e;
    const keyCode = koelnerPhonetik(key);
    const c = classify(compact, name, code, key, keyCode);
    if (!c) continue;
    for (const id of ids.length > 0 ? ids : [""]) {
      const hit: BrandHit = { rank: c.rank, kind: KIND[c.rank], key, label, id, code: keyCode, distance: c.distance };
      const dedupeKey = id || `key:${key}`;
      const prev = best.get(dedupeKey);
      if (!prev || compareHits(hit, prev) < 0) best.set(dedupeKey, hit);
    }
  }

  const hits = [...best.values()].sort(compareHits);
  if (hits.length === 0) return empty;

  const top = hits[0];
  const quelle = abgerufen ? `Wikidata, Stand ${abgerufen}` : "Wikidata";
  const lead =
    top.kind === "gleich"
      ? `Gleicht der Marke „${top.label}“`
      : top.kind === "klanggleich"
        ? `Klingt wie die Marke „${top.label}“`
        : top.kind === "schreibaehnlich"
          ? `Schreibt sich ähnlich wie die Marke „${top.label}“`
          : `Enthält die Marke „${top.label}“`;
  const generic = hits.length >= GENERIC_THRESHOLD ? "; möglicherweise ein Gattungswort" : "";

  const shown = hits.slice(0, MAX_EVIDENCE).map((h) => {
    const idPart = h.id ? `${h.id}, ` : "";
    return `${h.kind} ${h.label} (${idPart}Kölner ${h.code}, Levenshtein ${h.distance})`;
  });
  const more = hits.length > MAX_EVIDENCE ? `; ${hits.length - MAX_EVIDENCE} weitere` : "";

  return {
    hits,
    total: hits.length,
    url: tmviewUrl(top.label),
    note: `${lead} (${quelle}), nur Hinweis${generic}`,
    evidence: shown.join("; ") + more,
  };
}
