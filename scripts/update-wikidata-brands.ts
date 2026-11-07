/**
 * Erzeugt src/lib/engine/sources/wikidata-brands.json aus Wikidata (CC0).
 *
 * NUR VON HAND, mit Netz: `npx tsx scripts/update-wikidata-brands.ts [--min-sitelinks N] [--include-trademark]`.
 * Läuft weder im Build noch in CI noch in den Tests; kein npm-Skript. Ein einziger Abruf
 * (https://query.wikidata.org/sparql) ohne E-Mail-Adresse im User-Agent. Nur bei einem Timeout
 * fragt das Skript seitenweise ab. Das Ergebnis kommt per Pull Request ins Repository.
 *
 * Parameter:
 *   --min-sitelinks N     Mindestzahl Wikipedia-Verlinkungen (Standard 1; die Entscheidung ist offen).
 *   --include-trademark   Auch Einträge, die nur "Handelsmarke" (Q167270) und nicht "Marke" (Q431289) sind.
 *
 * Bewusst ohne Verknüpfung über P127 (Eigentümer) und P856 (Website): sie erzeugen Dubletten.
 * Ausgabe: Zahlen roh / nach Filter / nach Dedup, je Sitelink-Schwelle 0/1/3, Dateigröße,
 * Überschneidung Q431289/Q167270. Überschreitet die Datei 600 KB, wird nichts geschrieben.
 * Format, Filter und Deduplizierung stehen in src/lib/engine/sources/wikidata-brands-format.ts.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MAX_SNAPSHOT_BYTES,
  dedupe,
  passesFilter,
  serializeSnapshot,
  validateSnapshotText,
  type Candidate,
} from "../src/lib/engine/sources/wikidata-brands-format";

const ENDPOINT = "https://query.wikidata.org/sparql";
const TARGET = fileURLToPath(new URL("../src/lib/engine/sources/wikidata-brands.json", import.meta.url));
const USER_AGENT = "markenfrei-update-wikidata-brands (manuell)";
const BRAND = "Q431289";
const TRADEMARK = "Q167270";
const PAGE_SIZE = 20000;

const QUERY = `SELECT ?item ?label ?sitelinks ?type WHERE {
  VALUES ?type { wd:${BRAND} wd:${TRADEMARK} }
  ?item wdt:P31 ?type ; wikibase:sitelinks ?sitelinks ; rdfs:label ?label .
  FILTER(LANG(?label) IN ("de","en","mul"))
  FILTER NOT EXISTS { ?item wdt:P576 [] }
  FILTER NOT EXISTS { ?item wdt:P2669 [] }
}`;

type Row = { id: string; label: string; sitelinks: number; type: string };
type Binding = Record<string, { value: string } | undefined>;

function parseArgs(argv: string[]): { minSitelinks: number; includeTrademark: boolean } {
  let minSitelinks = 1;
  let includeTrademark = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--include-trademark") includeTrademark = true;
    else if (a === "--min-sitelinks" || a.startsWith("--min-sitelinks=")) {
      const v = a.includes("=") ? a.split("=")[1] : argv[++i];
      if (v === undefined || !/^\d+$/.test(v)) throw new Error("--min-sitelinks erwartet eine ganze Zahl >= 0");
      minSitelinks = Number(v);
    } else throw new Error(`Unbekannter Parameter: ${a}`);
  }
  return { minSitelinks, includeTrademark };
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
  const json = (await res.json()) as { results?: { bindings?: Binding[] } };
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
    if (!/^Q\d+$/.test(id) || !label || !Number.isFinite(sitelinks)) continue;
    rows.push({ id, label, sitelinks, type });
  }
  return rows;
}

async function fetchRows(): Promise<Row[]> {
  try {
    return toRows(await sparql(QUERY));
  } catch (e) {
    if (!(e as { timeout?: boolean }).timeout) throw e;
    console.log("Timeout beim Einzelabruf, frage seitenweise ab (Rückfall).");
  }
  // Rückfall: je Typ seitenweise, stabil sortiert.
  const rows: Row[] = [];
  for (const type of [BRAND, TRADEMARK]) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const paged = QUERY.replace(`VALUES ?type { wd:${BRAND} wd:${TRADEMARK} }`, `VALUES ?type { wd:${type} }`) +
        ` ORDER BY ?item ?label LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
      const page = toRows(await sparql(paged));
      rows.push(...page);
      console.log(`  ${type}: Seite ab ${offset}: ${page.length} Zeilen`);
      if (page.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

function candidatesFor(rows: Row[], includeTrademark: boolean): Candidate[] {
  const types = new Map<string, Set<string>>();
  for (const r of rows) {
    const t = types.get(r.id) ?? new Set<string>();
    t.add(r.type);
    types.set(r.id, t);
  }
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const r of rows) {
    if (!includeTrademark && !types.get(r.id)?.has(BRAND)) continue;
    const k = `${r.id}\u0000${r.label}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: r.id, label: r.label, sitelinks: r.sitelinks });
  }
  return out;
}

async function main(): Promise<void> {
  const { minSitelinks, includeTrademark } = parseArgs(process.argv.slice(2));
  const rows = await fetchRows();
  if (rows.length === 0) throw new Error("Keine Zeilen erhalten");

  const types = new Map<string, Set<string>>();
  for (const r of rows) types.set(r.id, (types.get(r.id) ?? new Set()).add(r.type));
  const both = [...types.values()].filter((t) => t.has(BRAND) && t.has(TRADEMARK)).length;
  const onlyBrand = [...types.values()].filter((t) => t.has(BRAND) && !t.has(TRADEMARK)).length;
  const onlyTrade = [...types.values()].filter((t) => !t.has(BRAND) && t.has(TRADEMARK)).length;

  const cands = candidatesFor(rows, includeTrademark);
  console.log(`Roh: ${rows.length} Zeilen, ${types.size} Einträge`);
  console.log(`Überschneidung ${BRAND}/${TRADEMARK}: beide ${both}, nur ${BRAND} ${onlyBrand}, nur ${TRADEMARK} ${onlyTrade}`);
  console.log(`Verwendet (${includeTrademark ? "mit" : "ohne"} reine ${TRADEMARK}): ${cands.length} Labels`);
  for (const n of [0, 1, 3]) {
    const f = cands.filter((c) => passesFilter(c, n));
    console.log(`Sitelinks >= ${n}: nach Filter ${f.length}, nach Dedup ${dedupe(f).length}`);
  }

  const filtered = cands.filter((c) => passesFilter(c, minSitelinks));
  const marken = dedupe(filtered);
  console.log(`Gewählt (--min-sitelinks ${minSitelinks}): nach Filter ${filtered.length}, nach Dedup ${marken.length}`);

  const text = serializeSnapshot({
    quelle: ENDPOINT,
    lizenz: "CC0 1.0, Wikidata",
    abgerufen: new Date().toISOString().slice(0, 10),
    abfrage_sha256: createHash("sha256").update(QUERY).digest("hex"),
    filter:
      `Typ ${includeTrademark ? `${BRAND} oder ${TRADEMARK}` : BRAND}; ohne aufgelöst (P576) und eingestellt (P2669); ` +
      `Labels de/en/mul; Schlüssel 3-30 Zeichen; lateinische Schrift; höchstens 4 Wörter; Sitelinks >= ${minSitelinks}; ` +
      `Dedup nach Schlüssel, höchstens 3 IDs`,
    anzahl: marken.length,
    marken,
  });
  const bytes = Buffer.byteLength(text);
  console.log(`Dateigröße: ${(bytes / 1024).toFixed(1)} KB (Grenze ${MAX_SNAPSHOT_BYTES / 1024} KB)`);
  if (bytes > MAX_SNAPSHOT_BYTES) throw new Error("Datei größer als die Obergrenze, nichts geschrieben. Höheres --min-sitelinks versuchen.");
  const errors = validateSnapshotText(text);
  if (errors.length > 0) throw new Error(`Formatprüfung fehlgeschlagen, nichts geschrieben:\n${errors.slice(0, 10).join("\n")}`);
  writeFileSync(TARGET, text, "utf8");
  console.log(`${marken.length} Marken geschrieben nach ${TARGET}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
