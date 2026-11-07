/**
 * Format des Wikidata-Markenschnappschusses (src/lib/engine/sources/wikidata-brands.json).
 *
 * Reine Funktionen ohne Netz und ohne Dateizugriff: Schlüsselbildung, Filter, Deduplizierung,
 * Serialisierung und Prüfung des Dateikopfs. Das Datenskript (scripts/update-wikidata-brands.ts)
 * und die Tests benutzen genau diese Funktionen. Phonetik-Codes stehen nicht in der Datei.
 */
import { foldToAscii } from "@/lib/name";

/** Obergrenze der Dateigröße in Byte (600 KB). Darüber bricht das Skript ab, und ein Test schlägt fehl. */
export const MAX_SNAPSHOT_BYTES = 600 * 1024;
/** Höchstzahl Wikidata-IDs je Eintrag. */
export const MAX_IDS_PER_BRAND = 3;
export const KEY_MIN = 3;
export const KEY_MAX = 30;
export const MAX_WORDS = 4;
export const KEY_PATTERN = /^[a-z0-9]{3,30}$/;
const QID = /^Q[1-9]\d*$/;

/** Ein Eintrag der Datei: [Schlüssel, Anzeigelabel, Wikidata-IDs]. */
export type BrandEntry = [key: string, label: string, ids: string[]];

/** Was der Schnappschuss enthält. Fehlt das Feld im Kopf, gilt: nur Marken. */
export type Enthaelt = "marken" | "firmen";
export const ENTHAELT_VALUES: readonly Enthaelt[] = ["marken", "firmen"];

export type SnapshotHeader = {
  quelle: string;
  lizenz: string;
  abgerufen: string;
  abfrage_sha256: string;
  filter: string;
  /** Optional (ältere Dateien haben es nicht): ["marken"] oder ["marken","firmen"]. */
  enthaelt?: Enthaelt[];
};

/** True, wenn der Kopf Firmennamen ausweist. Ohne Feld: false. */
export function containsCompanies(enthaelt: unknown): boolean {
  return Array.isArray(enthaelt) && enthaelt.includes("firmen");
}

export type Snapshot = SnapshotHeader & { anzahl: number; marken: BrandEntry[] };

/** Ein Label eines Wikidata-Eintrags, so wie die Abfrage es liefert. */
export type Candidate = { id: string; label: string; sitelinks: number };

/** Vergleichsschlüssel: foldToAscii, klein, nur [a-z0-9]. */
export function brandKey(label: string): string {
  return foldToAscii(label).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Nur lateinische Schrift: Jeder Buchstabe muss lateinisch sein (Ziffern und Satzzeichen sind erlaubt). */
export function isLatinLabel(label: string): boolean {
  let letters = 0;
  for (const ch of label) {
    if (/\p{L}/u.test(ch)) {
      if (!/\p{Script=Latin}/u.test(ch)) return false;
      letters++;
    }
  }
  return letters > 0;
}

export function wordCount(label: string): number {
  const t = label.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

/** Rechtsformen, die bei Firmen-Labels am Ende entfallen (verglichen ohne Punkte, klein). */
const LEGAL_FORMS = new Set([
  "inc", "corp", "corporation", "co", "company", "ltd", "limited", "llc", "plc", "gmbh", "ag", "se", "sa",
  "spa", "nv", "bv", "ab", "a/s", "kg", "ev",
]);

/**
 * Entfernt Rechtsformen am ENDE eines Firmen-Labels (auch mehrere, auch mit Komma davor:
 * "Foo Co., Ltd." -> "Foo"). Steht die Rechtsform nicht am Ende ("Corporation Zero"), bleibt das Label.
 * Bleibt sonst nichts übrig (Label besteht nur aus Rechtsformen), bleibt das Label unverändert.
 */
export function stripLegalForm(label: string): string {
  const tokens = label.trim().split(/\s+/).filter(Boolean);
  let removed = false;
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1].toLowerCase().replace(/\./g, "").replace(/,$/, "");
    if (LEGAL_FORMS.has(last)) {
      tokens.pop();
      removed = true;
    } else if (removed && (last === "&" || last === "und" || last === "and")) {
      tokens.pop();
    } else break;
  }
  if (!removed) return label;
  return tokens.join(" ").replace(/[,;]+$/, "");
}

/** Zeile der Abfrage: ein Label mit Typ (Wikidata-Klasse). */
export type Row = { id: string; label: string; sitelinks: number; type: string };

export const BRAND_TYPE = "Q431289";
export const TRADEMARK_TYPE = "Q167270";
/** Firmen: business, public company, enterprise. */
export const COMPANY_TYPES = ["Q4830453", "Q891723", "Q6881511"] as const;

export type CandidateOptions = {
  minSitelinks: number;
  includeTrademark: boolean;
  includeCompanies: boolean;
  companyMinSitelinks: number;
};

/**
 * Macht aus Abfragezeilen gefilterte Kandidaten. Marken (Q431289, optional Q167270) behalten ihr Label und
 * brauchen `minSitelinks`. Reine Firmen-Einträge (kein Markentyp) verlieren Rechtsformen am Ende und brauchen
 * `companyMinSitelinks`. Ein Eintrag, der Marke ist, gilt immer als Marke.
 */
export function buildCandidates(rows: Row[], o: CandidateOptions): Candidate[] {
  const types = new Map<string, Set<string>>();
  for (const r of rows) types.set(r.id, (types.get(r.id) ?? new Set<string>()).add(r.type));
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const r of rows) {
    const t = types.get(r.id);
    const isBrand = t?.has(BRAND_TYPE) || (o.includeTrademark && t?.has(TRADEMARK_TYPE));
    const isCompany = o.includeCompanies && COMPANY_TYPES.some((c) => t?.has(c));
    let cand: Candidate;
    if (isBrand) cand = { id: r.id, label: r.label, sitelinks: r.sitelinks };
    else if (isCompany) cand = { id: r.id, label: stripLegalForm(r.label), sitelinks: r.sitelinks };
    else continue;
    if (!passesFilter(cand, isBrand ? o.minSitelinks : o.companyMinSitelinks)) continue;
    const k = `${cand.id}\u0000${cand.label}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(cand);
  }
  return out;
}

/** Filtertext für den Dateikopf. */
export function describeFilter(o: CandidateOptions): string {
  return (
    `Typ ${o.includeTrademark ? `${BRAND_TYPE} oder ${TRADEMARK_TYPE}` : BRAND_TYPE}` +
    (o.includeCompanies
      ? ` sowie Firmen (${COMPANY_TYPES.join(", ")}; Sitelinks >= ${o.companyMinSitelinks}; Rechtsformen am Ende entfernt)`
      : "") +
    `; ohne aufgelöst (P576) und eingestellt (P2669); ` +
    `Labels de/en/mul; Schlüssel 3-30 Zeichen; lateinische Schrift; höchstens 4 Wörter; Sitelinks >= ${o.minSitelinks}` +
    `${o.includeCompanies ? " (Marken)" : ""}; Dedup nach Schlüssel, höchstens 3 IDs; ` +
    `enthält ${o.includeCompanies ? "Marken und Firmen" : "Marken"}`
  );
}

/** Filter gegen Müll. `minSitelinks` ist die (noch offene) Mindestzahl an Wikipedia-Verlinkungen. */
export function passesFilter(c: Candidate, minSitelinks: number): boolean {
  const key = brandKey(c.label);
  if (key.length < KEY_MIN || key.length > KEY_MAX) return false;
  if (!isLatinLabel(c.label)) return false;
  if (wordCount(c.label) > MAX_WORDS) return false;
  if (/^[0-9]+$/.test(key)) return false;
  if (key === c.id.toLowerCase()) return false;
  if (!QID.test(c.id)) return false;
  return c.sitelinks >= minSitelinks;
}

function qnum(id: string): number {
  return Number(id.slice(1));
}

/** Beste zuerst: mehr Sitelinks, dann kleinere Q-Nummer, dann Label (stabil, ohne Zufall). */
function better(a: Candidate, b: Candidate): number {
  return b.sitelinks - a.sitelinks || qnum(a.id) - qnum(b.id) || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
}

/**
 * Dedupliziert über alle Labels: Gleiche Schlüssel werden ein Eintrag mit höchstens
 * MAX_IDS_PER_BRAND IDs (die mit den meisten Sitelinks). Angezeigt wird das Label des Kandidaten
 * mit den meisten Sitelinks. Ergebnis ist nach Schlüssel sortiert.
 */
export function dedupe(candidates: Candidate[]): BrandEntry[] {
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = brandKey(c.label);
    const g = groups.get(key);
    if (g) g.push(c);
    else groups.set(key, [c]);
  }
  const out: BrandEntry[] = [];
  for (const [key, g] of groups) {
    g.sort(better);
    const ids: string[] = [];
    for (const c of g) if (!ids.includes(c.id) && ids.length < MAX_IDS_PER_BRAND) ids.push(c.id);
    out.push([key, g[0].label, ids]);
  }
  return out.sort(compareEntries);
}

function compareEntries(a: BrandEntry, b: BrandEntry): number {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}

/** Feste Serialisierung: Kopf zeilenweise, ein Eintrag pro Zeile (kleine Diffs). */
export function serializeSnapshot(s: Snapshot): string {
  const head =
    `"quelle": ${JSON.stringify(s.quelle)},\n"lizenz": ${JSON.stringify(s.lizenz)},\n` +
    `"abgerufen": ${JSON.stringify(s.abgerufen)},\n"abfrage_sha256": ${JSON.stringify(s.abfrage_sha256)},\n` +
    `"filter": ${JSON.stringify(s.filter)},\n` +
    (s.enthaelt === undefined ? "" : `"enthaelt": ${JSON.stringify(s.enthaelt)},\n`) +
    `"anzahl": ${s.anzahl},\n`;
  return `{\n${head}"marken": [\n${s.marken.map((m) => JSON.stringify(m)).join(",\n")}\n]}\n`;
}

export type ValidateOptions = {
  /** Untergrenze der Einträge (offen; für die echte Datei vom Aufrufer gesetzt). */
  minEntries?: number;
  maxBytes?: number;
};

/** Prüft Dateitext gegen das Format. Gibt alle gefundenen Fehler zurück (leer = in Ordnung). */
export function validateSnapshotText(text: string, opts: ValidateOptions = {}): string[] {
  const errors: string[] = [];
  const maxBytes = opts.maxBytes ?? MAX_SNAPSHOT_BYTES;
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > maxBytes) errors.push(`Datei zu groß: ${bytes} Byte (Grenze ${maxBytes})`);

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [...errors, "Kein gültiges JSON"];
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [...errors, "Wurzel ist kein Objekt"];
  const o = raw as Record<string, unknown>;

  for (const f of ["quelle", "lizenz", "abgerufen", "abfrage_sha256", "filter"] as const) {
    if (typeof o[f] !== "string" || (o[f] as string).trim() === "") errors.push(`Kopffeld fehlt oder leer: ${f}`);
  }
  if (o.enthaelt !== undefined) {
    const e = o.enthaelt;
    const ok =
      Array.isArray(e) &&
      e.every((x) => ENTHAELT_VALUES.includes(x as Enthaelt)) &&
      new Set(e).size === e.length &&
      e.includes("marken");
    if (!ok) errors.push('enthaelt ungültig (erlaubt: ["marken"] oder ["marken","firmen"])');
  }
  if (typeof o.lizenz === "string" && !o.lizenz.includes("CC0")) errors.push('lizenz enthält nicht "CC0"');
  if (typeof o.abgerufen === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(o.abgerufen);
    const d = m ? new Date(`${o.abgerufen}T00:00:00Z`) : null;
    if (!m || !d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== o.abgerufen) {
      errors.push("abgerufen ist kein ISO-Datum (JJJJ-MM-TT)");
    }
  }
  if (typeof o.abfrage_sha256 === "string" && !/^[0-9a-f]{64}$/.test(o.abfrage_sha256)) {
    errors.push("abfrage_sha256 ist kein SHA-256 in Hex");
  }
  if (!Array.isArray(o.marken)) return [...errors, "marken fehlt oder ist keine Liste"];
  if (typeof o.anzahl !== "number" || o.anzahl !== o.marken.length) {
    errors.push(`anzahl (${String(o.anzahl)}) passt nicht zur Länge der Liste (${o.marken.length})`);
  }
  if (opts.minEntries !== undefined && o.marken.length < opts.minEntries) {
    errors.push(`Zu wenige Einträge: ${o.marken.length} (Untergrenze ${opts.minEntries})`);
  }

  let prev = "";
  const entries: BrandEntry[] = [];
  o.marken.forEach((e, i) => {
    const at = `marken[${i}]`;
    if (!Array.isArray(e) || e.length !== 3) return void errors.push(`${at}: kein Tripel`);
    const [key, label, ids] = e as unknown[];
    if (typeof key !== "string" || !KEY_PATTERN.test(key)) return void errors.push(`${at}: Schlüssel ungültig`);
    if (typeof label !== "string" || label.trim() === "") return void errors.push(`${at}: Label fehlt`);
    if (brandKey(label) !== key) errors.push(`${at}: Schlüssel passt nicht zum Label (${key})`);
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_IDS_PER_BRAND) {
      return void errors.push(`${at}: 1 bis ${MAX_IDS_PER_BRAND} IDs erwartet`);
    }
    if (!ids.every((x) => typeof x === "string" && QID.test(x)) || new Set(ids).size !== ids.length) {
      return void errors.push(`${at}: IDs ungültig oder doppelt`);
    }
    if (i > 0 && !(prev < key)) errors.push(`${at}: nicht strikt sortiert oder Schlüssel doppelt (${key})`);
    prev = key;
    entries.push([key, label, ids as string[]]);
  });

  if (errors.length === 0) {
    // Festes Format: Neu-Serialisierung muss den Text exakt ergeben (ein Eintrag pro Zeile, Reihenfolge der Felder).
    const again = serializeSnapshot({ ...(o as unknown as SnapshotHeader), anzahl: entries.length, marken: entries });
    if (again !== text) errors.push("Textform weicht vom festen Format ab (Zeilen, Feldreihenfolge, Leerraum)");
  }
  return errors;
}
