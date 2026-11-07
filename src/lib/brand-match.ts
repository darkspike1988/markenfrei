import { koelnerPhonetik, levenshtein, PROTECTED_TECH_BRANDS } from "@/lib/phonetics";

/**
 * Abgleich eines Namens mit der festen Markenliste (ohne Netz, ohne Dateien). Liegt hier statt in
 * known-names.ts, damit Browser-Code (insights.ts) nur diese kleine Datei erreicht und nicht die
 * Quellen samt Wikidata-Schnappschuss (siehe tests/client-bundle-boundary.test.ts).
 */

/** Marke steht am Anfang oder Ende des Namens oder grenzt an einen Bindestrich. */
export function containsAtBoundary(name: string, brand: string): boolean {
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

export type BrandMatch = {
  brand: string;
  kind: "identisch" | "klanggleich" | "enthalten";
  detail: string;
};

/** Alle Treffer gegen PROTECTED_TECH_BRANDS, stärkste zuerst. Exportiert für Tests. */
export function matchKnownBrands(name: string, brands: readonly string[] = PROTECTED_TECH_BRANDS): BrandMatch[] {
  const compact = name.replace(/-/g, "");
  const code = koelnerPhonetik(compact);
  const identical: BrandMatch[] = [];
  const sound: BrandMatch[] = [];
  const contained: BrandMatch[] = [];

  for (const brand of brands) {
    if (name === brand || compact === brand) {
      identical.push({ brand, kind: "identisch", detail: `identisch mit ${brand}` });
      continue;
    }
    const brandCode = koelnerPhonetik(brand);
    const distance = levenshtein(compact, brand);
    if (code.length >= 4 && code === brandCode && distance <= 2) {
      sound.push({
        brand,
        kind: "klanggleich",
        detail: `klanggleich mit ${brand} (Kölner Phonetik ${code}, Levenshtein ${distance})`,
      });
      continue;
    }
    if (brand.length >= 5 && containsAtBoundary(name, brand)) {
      contained.push({ brand, kind: "enthalten", detail: `enthält ${brand} an einer Wortgrenze` });
    }
  }
  return [...identical, ...sound, ...contained];
}
