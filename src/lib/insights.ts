import { foldToAscii, normalizeName } from "@/lib/name";
import { domainLabelError } from "@/lib/engine/sources/domains";
import { matchKnownBrands } from "@/lib/engine/sources/known-names";
import { levenshtein, PROTECTED_TECH_BRANDS } from "@/lib/phonetics";

/**
 * Namensanalyse und Varianten, alles ohne Netz, ohne KI und ohne Bewertung. Es gibt keinen
 * Punktwert und keine Aussage, ob ein Name „gut“ ist: nur Tatsachen über die Zeichenfolge und
 * klar benannte Heuristiken (Silben sind geschätzt, Markenähnlichkeit ist eine Liste, kein Register).
 */

// ---------------------------------------------------------------------------
// Gemeinsame Hilfen
// ---------------------------------------------------------------------------

/** Ein Name, der als Domain-Label und nach `normalizeName` unverändert gültig ist. */
function isValidLabel(name: string): boolean {
  const r = normalizeName(name);
  return r.ok && r.name === name && domainLabelError(name) === undefined;
}

/** Wie `normalizeName`, aber für ungültige Eingaben ein bereinigter Rest statt eines Fehlers. */
function cleanName(raw: string): string {
  const r = normalizeName(raw);
  return r.ok ? r.name : foldToAscii(String(raw ?? "")).replace(/[^a-z0-9-]/g, "");
}

/**
 * Wählt `count` Einträge gleichmäßig über die Liste verteilt, in der Reihenfolge der Liste
 * (kein Zufall, damit die Ausgabe reproduzierbar bleibt).
 */
function pickSpread<T>(list: readonly T[], count: number): T[] {
  if (count >= list.length) return [...list];
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => list[Math.floor(((i + 0.5) * list.length) / count)]);
}

// ---------------------------------------------------------------------------
// Namens-Check
// ---------------------------------------------------------------------------

export type InsightFact = { label: string; value: string };

export type Confusable = {
  /** Anzeige des Paars, z. B. „rn / m“ */
  pair: string;
  /** Welche Seite(n) des Paars im Namen stehen */
  found: string[];
  /** Deutsche Erklärung */
  text: string;
  /** Namen, in denen die erste Fundstelle jeweils gegen das Gegenstück getauscht ist (nur gültige Labels) */
  lookalikes: string[];
};

export type TypoKind = "fehlend" | "doppelt" | "vertauscht";

export type TypoVariant = {
  name: string;
  kind: TypoKind;
  /** z. B. „e“ fehlt */
  label: string;
  /** Levenshtein-Abstand zum Namen (Vertauschen zählt dort als 2) */
  distance: number;
};

export type BrandHint = {
  brand: string;
  kind: "identisch" | "klanggleich" | "enthalten";
  /** z. B. „klingt ähnlich wie klarna“ */
  text: string;
};

export type NameInsights = {
  /** Der untersuchte, normalisierte Name */
  name: string;
  length: number;
  /** Geschätzte Silbenzahl (Vokalgruppen), 0 wenn der Name keinen Vokal enthält */
  syllables: number;
  digits: string[];
  hyphens: number;
  /** Unterschiedliche Doppelzeichen, z. B. „ll“ */
  doubleLetters: string[];
  /** Kurze Tatsachen für die Anzeige (Länge, Silben, Ziffern, Bindestriche, Doppelbuchstaben) */
  facts: InsightFact[];
  /** Folgen für Register und Dienste, nur aus den Regeln, die Markenfrei ohnehin prüft */
  registryNotes: string[];
  confusables: Confusable[];
  /** Höchstens 6 Tippfehler-Varianten, jede ein gültiges Label */
  typos: TypoVariant[];
  /** Treffer gegen die feste Markenliste, stärkste zuerst, höchstens 4 */
  brands: BrandHint[];
  /** Wie viele Treffer es insgesamt waren */
  brandTotal: number;
  /** So viele Marken enthält die geprüfte Liste */
  brandListSize: number;
  /** Namen, die „Tippfehler-Varianten prüfen“ vorbelegt: erst Tippfehler, dann Verwechslungen, ohne Dubletten */
  variantCandidates: string[];
};

export const MAX_TYPOS = 6;
/** So viele Varianten fügt „Tippfehler-Varianten prüfen“ höchstens hinzu. */
export const MAX_TYPO_CHECK = 5;
const MAX_BRAND_HINTS = 4;

/** Vokalgruppen je Buchstabenfolge. Nur eine Schätzung, deshalb im Ergebnis so benannt. */
function estimateSyllables(name: string): number {
  let count = 0;
  for (const part of name.split(/[^a-z]+/)) {
    count += part.match(/[aeiouy]+/g)?.length ?? 0;
  }
  return count;
}

function doubleLetters(name: string): string[] {
  const out = new Set<string>();
  for (const m of name.matchAll(/([a-z0-9])\1/g)) out.add(m[0]);
  return [...out];
}

/**
 * Hinweise zu Bindestrich, Ziffern und Länge. Die Aussagen stammen aus den Quellen von
 * Markenfrei (Social-Links, Paketregister, Android-ID, DPMA-Suchstring, Domain-Regeln) und
 * sind dort belegt.
 */
function registryNotes(name: string): string[] {
  const notes: string[] = [];
  if (name.includes("-")) {
    notes.push(
      "Instagram, TikTok und X erlauben keinen Bindestrich im Handle. Markenfrei verlinkt dort die Schreibweisen ohne Bindestrich und mit Unterstrich.",
      "pub.dev, Hex.pm und CRAN erlauben keinen Bindestrich (Variante mit Unterstrich, bei CRAN mit Punkt).",
      "Für die Android-Paket-ID fallen Bindestriche weg.",
      "Das DPMA gleicht Trennzeichen aus, deshalb stehen die Varianten ohne Bindestrich im Suchstring.",
    );
    if (name.includes("--")) notes.push("GitHub erlaubt keinen doppelten Bindestrich.");
  }
  const domain = domainLabelError(name);
  if (domain) notes.push(`Als Domain-Name: ${domain}`);
  if (/^[0-9]/.test(name)) {
    notes.push("Beginnt mit einer Ziffer: pub.dev, Hex.pm, CRAN und Android-Paketnamen verlangen einen Buchstaben am Anfang.");
  }
  // Längengrenzen einzelner Quellen (stores-social.ts: bsky.social 3 bis 18; packages.ts: JSR-Scope 2 bis 20, GitHub 39)
  const limits: string[] = [];
  if (name.length > 18) limits.push("bsky.social höchstens 18");
  if (name.length > 20) limits.push("JSR-Scopes höchstens 20");
  if (name.length > 39) limits.push("GitHub höchstens 39");
  if (limits.length > 0) notes.push(`Länger als erlaubt bei: ${limits.join(", ")} Zeichen.`);
  return notes;
}

/** Verwechselbare Zeichenfolgen: Suchmuster, Gegenstück, Paar-Anzeige. */
const CONFUSABLE_RULES: readonly { pair: string; text: string; swaps: readonly [string, string][] }[] = [
  {
    pair: "l / I / 1",
    text: "Kleines l, großes I und die Ziffer 1 sehen in vielen Schriften gleich aus.",
    swaps: [
      ["l", "1"],
      ["1", "l"],
    ],
  },
  {
    pair: "o / 0",
    text: "Der Buchstabe o und die Ziffer 0 sehen sich ähnlich.",
    swaps: [
      ["o", "0"],
      ["0", "o"],
    ],
  },
  {
    pair: "rn / m",
    text: "Die Folge rn wird leicht als m gelesen, und umgekehrt.",
    swaps: [
      ["rn", "m"],
      ["m", "rn"],
    ],
  },
  {
    pair: "vv / w",
    text: "Zwei v hintereinander sehen aus wie ein w, und umgekehrt.",
    swaps: [
      ["vv", "w"],
      ["w", "vv"],
    ],
  },
];

function confusables(name: string): Confusable[] {
  const out: Confusable[] = [];
  for (const rule of CONFUSABLE_RULES) {
    const found: string[] = [];
    const lookalikes: string[] = [];
    for (const [from, to] of rule.swaps) {
      const i = name.indexOf(from);
      if (i < 0) continue;
      found.push(from);
      const swapped = name.slice(0, i) + to + name.slice(i + from.length);
      if (swapped !== name && isValidLabel(swapped) && !lookalikes.includes(swapped)) lookalikes.push(swapped);
    }
    if (found.length > 0) out.push({ pair: rule.pair, found, text: rule.text, lookalikes });
  }
  return out;
}

/** Alle Tippfehler je Art, jeweils nur gültige, vom Namen verschiedene Labels ohne Dubletten. */
function typoCandidates(name: string): Record<TypoKind, TypoVariant[]> {
  const seen = new Set<string>([name]);
  const make = (kind: TypoKind, variant: string, label: string): TypoVariant | null => {
    if (seen.has(variant) || !isValidLabel(variant)) return null;
    seen.add(variant);
    return { name: variant, kind, label, distance: levenshtein(name, variant) };
  };
  const result: Record<TypoKind, TypoVariant[]> = { fehlend: [], doppelt: [], vertauscht: [] };
  for (let i = 0; i < name.length; i++) {
    const ch = name[i];
    const missing = make("fehlend", name.slice(0, i) + name.slice(i + 1), ch === "-" ? "Bindestrich fehlt" : `„${ch}“ fehlt`);
    if (missing) result.fehlend.push(missing);
  }
  for (let i = 0; i < name.length; i++) {
    const ch = name[i];
    if (ch === "-" || name[i - 1] === ch || name[i + 1] === ch) continue;
    const doubled = make("doppelt", name.slice(0, i + 1) + name.slice(i), `„${ch}“ doppelt`);
    if (doubled) result.doppelt.push(doubled);
  }
  for (let i = 0; i + 1 < name.length; i++) {
    const a = name[i];
    const b = name[i + 1];
    if (a === b || a === "-" || b === "-") continue;
    const swapped = make("vertauscht", name.slice(0, i) + b + a + name.slice(i + 2), `„${a}${b}“ vertauscht`);
    if (swapped) result.vertauscht.push(swapped);
  }
  return result;
}

/**
 * Bis zu `MAX_TYPOS` Tippfehler, gleichmäßig über den Namen verteilt und gleichmäßig auf die
 * drei Arten (fehlt, doppelt, vertauscht) verteilt, erst die mit Abstand 1.
 */
export function typoVariants(name: string): TypoVariant[] {
  const all = typoCandidates(name);
  const kinds: TypoKind[] = ["fehlend", "doppelt", "vertauscht"];
  const quota: Record<TypoKind, number> = { fehlend: 0, doppelt: 0, vertauscht: 0 };
  let left = MAX_TYPOS;
  for (let progress = true; left > 0 && progress; ) {
    progress = false;
    for (const k of kinds) {
      if (left > 0 && quota[k] < all[k].length) {
        quota[k]++;
        left--;
        progress = true;
      }
    }
  }
  return kinds.flatMap((k) => pickSpread(all[k], quota[k]));
}

function brandHints(name: string): { hints: BrandHint[]; total: number } {
  const matches = matchKnownBrands(name);
  const hints = matches.slice(0, MAX_BRAND_HINTS).map((m): BrandHint => ({
    brand: m.brand,
    kind: m.kind,
    text:
      m.kind === "identisch"
        ? `identisch mit ${m.brand}`
        : m.kind === "klanggleich"
          ? `klingt ähnlich wie ${m.brand}`
          : `enthält ${m.brand}`,
  }));
  return { hints, total: matches.length };
}

/**
 * Tatsachen und klar benannte Heuristiken zu einem Namen. Rein und deterministisch, ohne Wertung.
 * Die Eingabe wird wie bei der Prüfung normalisiert (Kleinbuchstaben, Umlaute ausgeschrieben).
 */
export function analyzeName(input: string): NameInsights {
  const name = cleanName(input);
  const syllables = estimateSyllables(name);
  const digits = name.match(/[0-9]/g) ?? [];
  const hyphens = (name.match(/-/g) ?? []).length;
  const doubles = doubleLetters(name);
  const conf = confusables(name);
  const typos = typoVariants(name);
  const { hints, total } = brandHints(name);

  const facts: InsightFact[] = [
    { label: "Länge", value: `${name.length} Zeichen` },
    { label: "Silben", value: syllables > 0 ? `ca. ${syllables} (geschätzt)` : "nicht schätzbar, kein Vokal" },
    { label: "Ziffern", value: digits.length > 0 ? digits.join(" ") : "keine" },
    { label: "Bindestriche", value: hyphens > 0 ? String(hyphens) : "keine" },
    { label: "Doppelzeichen", value: doubles.length > 0 ? doubles.join(", ") : "keine" },
  ];

  // Tippfehler mit Abstand 1 zuerst, dann Vertauschungen, dann Verwechslungen.
  const ordered = [...typos].sort((a, b) => a.distance - b.distance).map((t) => t.name);
  const variantCandidates = [...new Set([...ordered, ...conf.flatMap((c) => c.lookalikes)])].filter((v) => v !== name);

  return {
    name,
    length: name.length,
    syllables,
    digits,
    hyphens,
    doubleLetters: doubles,
    facts,
    registryNotes: registryNotes(name),
    confusables: conf,
    typos,
    brands: hints,
    brandTotal: total,
    brandListSize: PROTECTED_TECH_BRANDS.length,
    variantCandidates,
  };
}

// ---------------------------------------------------------------------------
// Varianten-Auswahl
// ---------------------------------------------------------------------------

export const VARIANT_PREFIXES = ["get", "try", "use", "my", "the"] as const;
export const VARIANT_SUFFIXES = ["app", "hq", "labs", "io", "hub", "kit", "lab", "dev"] as const;

export type VariantKind = "praefix" | "suffix" | "bindestrich" | "plural";

export type Variant = { name: string; kind: VariantKind; label: string };

export type VariantOptions = {
  /** Gewählte Präfixe, nur Einträge aus `VARIANT_PREFIXES` zählen */
  prefixes?: readonly string[];
  /** Gewählte Suffixe, nur Einträge aus `VARIANT_SUFFIXES` zählen */
  suffixes?: readonly string[];
  /**
   * Bindestrich-Schreibweisen: aus „wach werk“ werden wachwerk und wach-werk (die Eingabe selbst
   * gehört nicht zur Liste), Präfixe und Suffixe entstehen zusätzlich mit Bindestrich.
   */
  hyphen?: boolean;
  /** Mit s anhängen oder, wenn der Name auf s endet, das s entfernen */
  plural?: boolean;
  /** Höchstzahl der Kandidaten (Standard `MAX_VARIANTS`) */
  max?: number;
};

export const MAX_VARIANTS = 60;

/** Wörter der Eingabe, getrennt an Leerzeichen, Bindestrich und Unterstrich. */
function baseWords(raw: string, baseName: string): string[] {
  const tokens = foldToAscii(raw.trim())
    .split(/[\s_-]+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  // Bei abgetrennter Endung („wachwerk.de“) passen Wörter und Name nicht zusammen: ein Wort.
  return tokens.join("") === baseName.replace(/-/g, "") ? tokens : [baseName];
}

/**
 * Kandidaten aus Mustern für einen Grundnamen: Präfixe, Suffixe, Bindestrich, Plural/Singular.
 * Jeder Kandidat ist ein gültiges Domain-Label (`normalizeName`), ohne Dubletten und ohne den
 * Grundnamen selbst. Reihenfolge: Bindestrich, Präfixe, Suffixe, Plural. Rein und deterministisch.
 */
export function generateVariants(base: string, options: VariantOptions = {}): Variant[] {
  const r = normalizeName(base);
  if (!r.ok) return [];
  const baseName = r.name;
  const max = Math.max(0, Math.floor(options.max ?? MAX_VARIANTS));
  const prefixes = VARIANT_PREFIXES.filter((p) => options.prefixes?.includes(p));
  const suffixes = VARIANT_SUFFIXES.filter((s) => options.suffixes?.includes(s));
  const hyphen = options.hyphen === true;

  const out: Variant[] = [];
  const seen = new Set<string>([baseName]);
  const add = (name: string, kind: VariantKind, label: string) => {
    if (out.length >= max || seen.has(name) || !isValidLabel(name)) return;
    seen.add(name);
    out.push({ name, kind, label });
  };

  if (hyphen) {
    const words = baseWords(base, baseName);
    if (words.length >= 2) {
      add(words.join(""), "bindestrich", "ohne Bindestrich");
      add(words.join("-"), "bindestrich", "mit Bindestrich");
    }
  }
  for (const p of prefixes) {
    if (baseName.startsWith(p)) continue;
    add(`${p}${baseName}`, "praefix", `Präfix ${p}`);
    if (hyphen) add(`${p}-${baseName}`, "praefix", `Präfix ${p} mit Bindestrich`);
  }
  for (const s of suffixes) {
    if (baseName.endsWith(s)) continue;
    add(`${baseName}${s}`, "suffix", `Suffix ${s}`);
    if (hyphen) add(`${baseName}-${s}`, "suffix", `Suffix ${s} mit Bindestrich`);
  }
  if (options.plural) {
    if (baseName.endsWith("s")) add(baseName.slice(0, -1), "plural", "Singular ohne s");
    else add(`${baseName}s`, "plural", "Plural mit s");
  }
  return out;
}

/**
 * Prüfliste aus Original und Varianten: das Original steht vorn, Dubletten fallen weg, höchstens
 * `max` Namen. `dropped` zählt die Varianten, die wegen der Grenze nicht mehr hineinpassen.
 */
export function buildShortlist(
  original: string,
  variants: readonly string[],
  max: number,
): { names: string[]; dropped: number } {
  const unique = [...new Set(variants.filter((v) => v !== original))];
  const room = Math.max(0, max - 1);
  return { names: [original, ...unique.slice(0, room)], dropped: Math.max(0, unique.length - room) };
}
