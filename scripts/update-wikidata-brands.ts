/**
 * Erzeugt src/lib/engine/sources/wikidata-brands.json aus Wikidata (CC0).
 *
 * NUR VON HAND, mit Netz: `npx tsx scripts/update-wikidata-brands.ts [--min-sitelinks N] [--include-trademark]
 * [--include-companies [--company-min-sitelinks N]]`.
 * Läuft weder im Build noch in CI noch in den Tests; kein npm-Skript. Ein einziger Abruf
 * (https://query.wikidata.org/sparql) ohne E-Mail-Adresse im User-Agent. Nur bei einem Timeout
 * fragt das Skript seitenweise ab. Das Ergebnis kommt per Pull Request ins Repository.
 *
 * Parameter:
 *   --min-sitelinks N         Mindestzahl Wikipedia-Verlinkungen (Standard 1; die Entscheidung ist offen).
 *   --include-trademark       Auch Einträge, die nur "Handelsmarke" (Q167270) und nicht "Marke" (Q431289) sind.
 *   --include-companies       Zusätzlich Firmen (P31 in Q4830453 business, Q891723 public company, Q6881511 enterprise)
 *                             mit Sitelinks >= --company-min-sitelinks N (Standard 20). Bei Firmen-Labels (nicht bei
 *                             Marken) entfallen Rechtsformen am Ende (Inc, GmbH, AG ...). Der Dateikopf bekommt
 *                             enthaelt: ["marken","firmen"] (sonst ["marken"]).
 *
 * Bewusst ohne Verknüpfung über P127 (Eigentümer) und P856 (Website): sie erzeugen Dubletten.
 * Ausgabe: Zahlen roh / nach Filter / nach Dedup, je Sitelink-Schwelle 0/1/3, Dateigröße,
 * Überschneidung Q431289/Q167270. Überschreitet die Datei 600 KB, wird nichts geschrieben.
 * Format, Filter, Rechtsformen und Deduplizierung stehen in src/lib/engine/sources/wikidata-brands-format.ts.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BRAND_TYPE,
  COMPANY_TYPES,
  MAX_SNAPSHOT_BYTES,
  TRADEMARK_TYPE,
  buildCandidates,
  dedupe,
  describeFilter,
  serializeSnapshot,
  validateSnapshotText,
  type CandidateOptions,
  type Row,
} from "../src/lib/engine/sources/wikidata-brands-format";

const ENDPOINT = "https://query.wikidata.org/sparql";
const TARGET = fileURLToPath(new URL("../src/lib/engine/sources/wikidata-brands.json", import.meta.url));
const USER_AGENT = "markenfrei-update-wikidata-brands (manuell)";
const BRAND = BRAND_TYPE;
const TRADEMARK = TRADEMARK_TYPE;
const PAGE_SIZE = 20000;

/** Abfrage für die angegebenen Typen. Firmen-Typen nur mit Sitelinks >= companyMin (spart Last und Zeit). */
function buildQuery(types: readonly string[], companyMin: number): string {
  const hasCompany = types.some((t) => (COMPANY_TYPES as readonly string[]).includes(t));
  const companyFilter = hasCompany
    ? `\n  FILTER(?type IN (wd:${BRAND}, wd:${TRADEMARK}) || ?sitelinks >= ${companyMin})`
    : "";
  return `SELECT ?item ?label ?sitelinks ?type WHERE {
  VALUES ?type { ${types.map((t) => `wd:${t}`).join(" ")} }
  ?item wdt:P31 ?type ; wikibase:sitelinks ?sitelinks ; rdfs:label ?label .
  FILTER(LANG(?label) IN ("de","en","mul"))
  FILTER NOT EXISTS { ?item wdt:P576 [] }
  FILTER NOT EXISTS { ?item wdt:P2669 [] }${companyFilter}
}`;
}

type Binding = Record<string, { value: string } | undefined>;
type Args = { minSitelinks: number; includeTrademark: boolean; includeCompanies: boolean; companyMinSitelinks: number };

function parseArgs(argv: string[]): Args {
  const out: Args = { minSitelinks: 1, includeTrademark: false, includeCompanies: false, companyMinSitelinks: 20 };
  const intArg = (name: string, a: string, i: number): [number, number] => {
    const v = a.includes("=") ? a.split("=")[1] : argv[i + 1];
    if (v === undefined || !/^\d+$/.test(v)) throw new Error(`${name} erwartet eine ganze Zahl >= 0`);
    return [Number(v), a.includes("=") ? i : i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--include-trademark") out.includeTrademark = true;
    else if (a === "--include-companies") out.includeCompanies = true;
    else if (a === "--min-sitelinks" || a.startsWith("--min-sitelinks=")) {
      [out.minSitelinks, i] = intArg("--min-sitelinks", a, i);
    } else if (a === "--company-min-sitelinks" || a.startsWith("--company-min-sitelinks=")) {
      [out.companyMinSitelinks, i] = intArg("--company-min-sitelinks", a, i);
    } else throw new Error(`Unbekannter Parameter: ${a}`);
  }
  return out;
}

async function sparql(query: string): Promise<Binding[]> {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Wikidata: HTTP ${res.status} ${body.slice(0, 200)}`) as Error & { timeout?: boolean };
    err.timeout = res.status === 504 || res.status === 500 || /timeout/i.test(body);
    throw err;
  }
  let json: { results?: { bindings?: Binding[] } };
  try {
    // Einzelne Labels bei Wikidata enthalten Steuerzeichen (z. B. Tabulator), die in JSON-Strings verboten sind.
    const text = (await res.text()).replace(/[\u0000-\u001F]/g, " ");
    json = JSON.parse(text) as { results?: { bindings?: Binding[] } };
  } catch (cause) {
    // Wikidata bricht lange Abfragen nach dem Zeitlimit mitten im Text ab: das gilt wie ein Timeout.
    const err = new Error(`Wikidata: Antwort abgeschnitten oder kein JSON (${(cause as Error).message})`) as Error & { timeout?: boolean };
    err.timeout = true;
    throw err;
  }
  if (!Array.isArray(json.results?.bindings)) throw new Error("Unerwartetes Format: results.bindings fehlt");
  return json.results.bindings;
}

function toRows(bindings: Binding[]): Row[] {
  const rows: Row[] = [];
  for (const b of bindings) {
    const id = b.item?.value.split("/").pop() ?? "";
    const type = b.type?.value.split("/").pop() ?? "";
    const label = b.label?.value;
    const sitelinks = Number(b.sitelinks?.value);
    if (!/^Q\d+$/.test(id) || !label || /^Q\d+$/.test(label) || !Number.isFinite(sitelinks)) continue;
    if (b.end?.value) continue; // aufgelöst (P576) oder eingestellt (P2669); nur die Firmen-Abfrage liefert ?end
    rows.push({ id, label, sitelinks, type });
  }
  return rows;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Firmen in EINER eigenen Abfrage: erst die Sitelinks-Schwelle, dann ?end (P576/P2669) als OPTIONAL und
 * das Label über den Label-Dienst. Die Form mit FILTER NOT EXISTS und ORDER BY läuft bei Wikidata ins
 * Zeitlimit (gemessen am 07.11.2026: 504 nach 65 s; diese Form braucht etwa 45 s).
 */
function buildCompanyQuery(lo: number, hi: number): string {
  return `SELECT ?item ?label ?sitelinks ?type ?end WHERE {
  VALUES ?type { ${COMPANY_TYPES.map((t) => `wd:${t}`).join(" ")} }
  ?item wdt:P31 ?type ; wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${lo} && ?sitelinks < ${hi})
  OPTIONAL { ?item wdt:P576 ?d1 } OPTIONAL { ?item wdt:P2669 ?d2 }
  BIND(COALESCE(?d1, ?d2) AS ?end)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de". ?item rdfs:label ?label. }
}`;
}

/** Bänder nach Sitelinks, damit jede Antwort klein bleibt (eine große Antwort wurde bei etwa 614 KB abgeschnitten). */
function companyBands(min: number): Array<[number, number]> {
  const cuts = [min, ...[30, 40, 50, 65, 80, 100, 150].filter((c) => c > min), 1_000_000];
  return cuts.slice(0, -1).map((lo, i) => [lo, cuts[i + 1]] as [number, number]);
}

async function sparqlWithRetry(query: string): Promise<Binding[]> {
  try {
    return await sparql(query);
  } catch (e) {
    console.log(`  Fehler (${(e as Error).message.slice(0, 90)}), neuer Versuch nach 65 s.`);
    await sleep(65_000);
    return sparql(query);
  }
}

async function fetchBrandRows(o: Args): Promise<Row[]> {
  const all = [BRAND, TRADEMARK];
  try {
    return toRows(await sparql(buildQuery(all, o.companyMinSitelinks)));
  } catch (e) {
    if (!(e as { timeout?: boolean }).timeout) throw e;
    console.log("Timeout beim Einzelabruf, frage seitenweise ab (Rückfall).");
  }
  // Rückfall: je Typ seitenweise, stabil sortiert.
  const rows: Row[] = [];
  for (const type of all) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const paged =
        buildQuery([type], o.companyMinSitelinks) + ` ORDER BY ?item ?label LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
      const page = toRows(await sparql(paged));
      rows.push(...page);
      console.log(`  ${type}: Seite ab ${offset}: ${page.length} Zeilen`);
      if (page.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

async function fetchRows(o: Args): Promise<Row[]> {
  const rows = await fetchBrandRows(o);
  if (!o.includeCompanies) return rows;
  // Wikidata erlaubt etwa eine Anfrage pro Minute (HTTP 429 sonst).
  const firms: Row[] = [];
  for (const [lo, hi] of companyBands(o.companyMinSitelinks)) {
    const cachedAlready = existsSync(fileURLToPath(new URL(`../.cache-wikidata-band-${lo}-${hi}.json`, import.meta.url)));
    if (!cachedAlready) {
      console.log(`Warte 65 s (Wikidata-Anfragegrenze), dann Firmen mit Sitelinks ${lo} bis ${hi === 1_000_000 ? "offen" : hi - 1}.`);
      await sleep(65_000);
    }
    // Zwischenspeicher je Band, damit ein Fehlschlag später nicht alles neu holt (nur dieser manuelle Lauf).
    const cache = fileURLToPath(new URL(`../.cache-wikidata-band-${lo}-${hi}.json`, import.meta.url));
    let bindings: Binding[];
    if (existsSync(cache)) {
      bindings = JSON.parse(readFileSync(cache, "utf8")) as Binding[];
      console.log(`  (aus Zwischenspeicher ${lo}-${hi})`);
    } else {
      bindings = await sparqlWithRetry(buildCompanyQuery(lo, hi));
      writeFileSync(cache, JSON.stringify(bindings));
    }
    const part = toRows(bindings);
    console.log(`  Firmen-Band ${lo}-${hi === 1_000_000 ? "offen" : hi - 1}: ${part.length} Zeilen (ohne aufgelöste)`);
    firms.push(...part);
  }
  return [...rows, ...firms];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { minSitelinks, includeTrademark, includeCompanies, companyMinSitelinks } = args;
  const rows = await fetchRows(args);
  if (rows.length === 0) throw new Error("Keine Zeilen erhalten");

  const types = new Map<string, Set<string>>();
  for (const r of rows) types.set(r.id, (types.get(r.id) ?? new Set()).add(r.type));
  const both = [...types.values()].filter((t) => t.has(BRAND) && t.has(TRADEMARK)).length;
  const onlyBrand = [...types.values()].filter((t) => t.has(BRAND) && !t.has(TRADEMARK)).length;
  const onlyTrade = [...types.values()].filter((t) => !t.has(BRAND) && t.has(TRADEMARK)).length;
  console.log(`Roh: ${rows.length} Zeilen, ${types.size} Einträge`);
  console.log(`Überschneidung ${BRAND}/${TRADEMARK}: beide ${both}, nur ${BRAND} ${onlyBrand}, nur ${TRADEMARK} ${onlyTrade}`);

  const opts = (min: number): CandidateOptions => ({
    minSitelinks: min,
    includeTrademark,
    includeCompanies,
    companyMinSitelinks,
  });
  for (const n of [0, 1, 3]) {
    const f = buildCandidates(rows, opts(n));
    console.log(`Marken-Sitelinks >= ${n}: nach Filter ${f.length}, nach Dedup ${dedupe(f).length}`);
  }

  const filtered = buildCandidates(rows, opts(minSitelinks));
  const marken = dedupe(filtered);
  const chosen = includeCompanies ? `${minSitelinks}, --company-min-sitelinks ${companyMinSitelinks}` : `${minSitelinks}`;
  console.log(`Gewählt (--min-sitelinks ${chosen}): nach Filter ${filtered.length}, nach Dedup ${marken.length}`);

  const queryTypes = [BRAND, TRADEMARK, ...(includeCompanies ? COMPANY_TYPES : [])];
  const text = serializeSnapshot({
    quelle: ENDPOINT,
    lizenz: "CC0 1.0, Wikidata",
    abgerufen: new Date().toISOString().slice(0, 10),
    abfrage_sha256: createHash("sha256").update(buildQuery([BRAND, TRADEMARK], companyMinSitelinks) + (includeCompanies ? companyBands(companyMinSitelinks).map(([lo, hi]) => buildCompanyQuery(lo, hi)).join("") : "")).digest("hex"),
    filter: describeFilter(opts(minSitelinks)),
    enthaelt: includeCompanies ? ["marken", "firmen"] : ["marken"],
    anzahl: marken.length,
    marken,
  });
  const bytes = Buffer.byteLength(text);
  console.log(`Dateigröße: ${(bytes / 1024).toFixed(1)} KB (Grenze ${MAX_SNAPSHOT_BYTES / 1024} KB)`);
  if (bytes > MAX_SNAPSHOT_BYTES) {
    throw new Error("Datei größer als die Obergrenze, nichts geschrieben. Höheres --min-sitelinks oder --company-min-sitelinks versuchen.");
  }
  const errors = validateSnapshotText(text);
  if (errors.length > 0) throw new Error(`Formatprüfung fehlgeschlagen, nichts geschrieben:\n${errors.slice(0, 10).join("\n")}`);
  writeFileSync(TARGET, text, "utf8");
  console.log(`${marken.length} Einträge geschrieben nach ${TARGET}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
