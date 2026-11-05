import type { CheckContext, HttpResponse, Source, SourceResult, Status } from "@/lib/engine/types";
import { foldToAscii } from "@/lib/name";
import { koelnerPhonetik, levenshtein, PROTECTED_TECH_BRANDS } from "@/lib/phonetics";

/**
 * Quellen im Namensraum "known_names": bekannte Marken (Heuristik ohne Netz), Wikidata, GLEIF,
 * Wikipedia (schwach) und Show HN (schwach). Keine dieser Quellen ist ein Markenregister.
 */

const NAMESPACE = "known_names" as const;

/** Gleiche Regel wie normalizeName: a-z, 0-9, Bindestrich innen, 2 bis 63 Zeichen. */
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;

type Base = Pick<SourceResult, "sourceId" | "label" | "target">;

function result(base: Base, status: Status, extra: Partial<SourceResult> = {}): SourceResult {
  return { ...base, namespace: NAMESPACE, status, ...extra };
}

function invalidName(base: Base): SourceResult {
  return result(base, "invalid", {
    note: "Name ungültig (erlaubt: a-z, 0-9, Bindestrich, 2 bis 63 Zeichen)",
  });
}

/** Wertet Antworten ohne verwertbaren Inhalt aus. null heißt: Antwort weiter auswerten. */
function failure(base: Base, res: HttpResponse, url?: string): SourceResult | null {
  if (res.error) {
    const note =
      res.error === "timeout" || res.error === "deadline"
        ? "Zeitüberschreitung, nicht geprüft"
        : res.error === "budget"
          ? "Abfragelimit des Dienstes erreicht, später erneut prüfen"
          : res.error === "too_large"
          ? "Antwort zu groß, nicht geprüft"
          : res.error === "parse"
            ? "Antwort nicht lesbar, nicht geprüft"
            : "Netzwerkfehler, nicht geprüft";
    const evidence = res.status ? `HTTP ${res.status}, ${res.error}` : res.error;
    return result(base, "unknown", { url, note, evidence });
  }
  if (res.status === 429) {
    const retry = res.headers.get("retry-after");
    return result(base, "unknown", {
      url,
      note: "Ratenlimit der Quelle erreicht, nicht geprüft",
      evidence: `HTTP 429${retry ? `, Retry-After ${retry}` : ""}`,
    });
  }
  if (res.status >= 500) {
    return result(base, "unknown", {
      url,
      note: "Quelle gestört, nicht geprüft",
      evidence: `HTTP ${res.status}`,
    });
  }
  return null;
}

function unexpected(base: Base, evidence: string, url?: string): SourceResult {
  return result(base, "unknown", { url, note: "Unerwartete Antwort, nicht geprüft", evidence });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// known_brands: Heuristik gegen die feste Markenliste, ohne Netz
// ---------------------------------------------------------------------------

function tmviewUrl(term: string): string {
  return `https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=${encodeURIComponent(term)}`;
}

/** Marke steht am Anfang oder Ende des Namens oder grenzt an einen Bindestrich. */
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

const knownBrands: Source = {
  id: "known_brands",
  namespace: NAMESPACE,
  label: "Bekannte Marken",
  defaultEnabled: true,
  description:
    `Heuristik ohne Netz gegen ${PROTECTED_TECH_BRANDS.length} bekannte Tech-Marken: identisch, klanggleich (Kölner Phonetik und Levenshtein) oder an einer Wortgrenze enthalten. Kein Markenregister.`,
  endpoint: "offline:phonetics.PROTECTED_TECH_BRANDS",
  async check(name) {
    const base: Base = { sourceId: "known_brands", label: "Bekannte Marken", target: name };
    try {
      if (!NAME_RE.test(name)) return invalidName(base);
      const matches = matchKnownBrands(name);
      if (matches.length === 0) {
        return result(base, "not_found", {
          note: `nur ${PROTECTED_TECH_BRANDS.length} bekannte Marken geprüft, kein Register`,
        });
      }
      const top = matches[0];
      return result(base, top.kind === "identisch" ? "taken" : "similar", {
        url: tmviewUrl(top.brand),
        note:
          top.kind === "identisch"
            ? `Identisch mit der bekannten Marke „${top.brand}“`
            : top.kind === "klanggleich"
              ? `Klingt wie die bekannte Marke „${top.brand}“`
              : `Enthält die bekannte Marke „${top.brand}“`,
        evidence: matches
          .slice(0, 4)
          .map((m) => m.detail)
          .join("; ") + (matches.length > 4 ? `; ${matches.length - 4} weitere` : ""),
      });
    } catch {
      return unexpected(base, "interner Fehler");
    }
  },
};

// ---------------------------------------------------------------------------
// wikidata: SPARQL, exaktes Label (de/en, ohne Groß-/Kleinschreibung) mit passendem Typ
// ---------------------------------------------------------------------------

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

/**
 * Erlaubte Typen (P31/P279*) mit deutschem Namen für den Hinweis. Bewusst eng: "Website" (Q35127)
 * und "Produkt" (Q2424752) hängen an Büchern, Waren und Gattungsbegriffen, sodass Wörter wie
 * "wasser" oder "kaffee" fälschlich als vergeben gälten.
 */
export const WIKIDATA_TYPES: Record<string, string> = {
  Q4830453: "Unternehmen",
  Q431289: "Marke",
  Q7397: "Software",
  Q620615: "Mobile App",
};

function sparqlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Schreibweisen, gegen die das Label (kleingeschrieben) verglichen wird. */
function labelForms(name: string): string[] {
  return Array.from(new Set([name, name.replace(/-/g, " ")]));
}

/** Sprachen der Labels. "mul" ist seit 2024 das sprachübergreifende Standard-Label. */
const WIKIDATA_LANGS = ["de", "en", "mul"] as const;

/** Groß-/Kleinschreibungen für die direkte (exakte) Label-Abfrage. */
function exactLabelForms(name: string): string[] {
  const out = new Set<string>();
  for (const base of labelForms(name)) {
    out.add(base);
    out.add(base.charAt(0).toUpperCase() + base.slice(1));
    out.add(base.replace(/(^|[\s-])([a-z])/g, (_m, sep: string, c: string) => sep + c.toUpperCase()));
    out.add(base.toUpperCase());
  }
  return Array.from(out);
}

/**
 * Baut die SPARQL-Abfrage. Kandidaten kommen aus zwei Wegen: der Wikidata-Suche (EntitySearch,
 * ohne Groß-/Kleinschreibung, Label und Alias, höchstens 20 Treffer) und einer direkten Abfrage
 * der üblichen Schreibweisen als Label in de, en und mul (findet exakte Treffer auch hinter
 * Platz 20 der Suche). Danach exakter Vergleich über LCASE auf das Label in de, en oder mul,
 * zusätzlich ohne Leer- und Satzzeichen ("Trade Republic" passt auf "traderepublic"), und
 * Typprüfung über P31/P279*.
 */
export function buildWikidataQuery(name: string): string {
  const forms = labelForms(name).map(sparqlString).join(", ");
  const compact = sparqlString(name.replace(/-/g, ""));
  const langs = WIKIDATA_LANGS.map((l) => `"${l}"`).join(", ");
  const exact = exactLabelForms(name)
    .flatMap((f) => WIKIDATA_LANGS.map((l) => `${sparqlString(f)}@${l}`))
    .join(" ");
  const types = Object.keys(WIKIDATA_TYPES)
    .map((q) => `wd:${q}`)
    .join(" ");
  return [
    "SELECT DISTINCT ?item ?type WHERE {",
    '  hint:Query hint:optimizer "None" .',
    "  {",
    "    SERVICE wikibase:mwapi {",
    '      bd:serviceParam wikibase:endpoint "www.wikidata.org" ;',
    '        wikibase:api "EntitySearch" ;',
    `        mwapi:search ${sparqlString(name.replace(/-/g, " "))} ;`,
    '        mwapi:language "en" ;',
    '        mwapi:limit "20" .',
    "      ?item wikibase:apiOutputItem mwapi:item .",
    "    }",
    "  } UNION {",
    `    VALUES ?exact { ${exact} }`,
    "    ?item rdfs:label ?exact .",
    "  }",
    "  ?item rdfs:label ?label .",
    `  FILTER(LANG(?label) IN (${langs}))`,
    `  FILTER(LCASE(STR(?label)) IN (${forms}) || REPLACE(LCASE(STR(?label)), "[^a-z0-9]", "") = ${compact})`,
    `  VALUES ?type { ${types} }`,
    "  ?item wdt:P31/wdt:P279* ?type .",
    "}",
    "LIMIT 20",
  ].join("\n");
}

export function wikidataApiUrl(name: string): string {
  return `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(buildWikidataQuery(name))}`;
}

function wikidataSearchUrl(name: string): string {
  return `https://www.wikidata.org/w/index.php?search=${encodeURIComponent(name)}`;
}

const wikidata: Source = {
  id: "wikidata",
  namespace: NAMESPACE,
  label: "Wikidata",
  defaultEnabled: true,
  description:
    "Wikidata (SPARQL): exaktes Label in Deutsch, Englisch oder sprachübergreifend (mul) mit Typ Unternehmen, Marke, Software oder Mobile App. Kein Markenregister.",
  endpoint: `${WIKIDATA_ENDPOINT}?query={SPARQL}`,
  async check(name, ctx: CheckContext) {
    const base: Base = { sourceId: "wikidata", label: "Wikidata", target: name };
    const searchUrl = wikidataSearchUrl(name);
    try {
      if (!NAME_RE.test(name)) return invalidName(base);
      const res = await ctx.http.request(wikidataApiUrl(name), {
        headers: { Accept: "application/sparql-results+json" },
        read: "json",
        maxBytes: 64 * 1024,
        timeoutMs: 5000,
        retry: true,
      });
      const fail = failure(base, res, searchUrl);
      if (fail) return fail;
      if (res.status !== 200) return unexpected(base, `HTTP ${res.status}`, searchUrl);

      const body = res.json;
      const bindings =
        isObject(body) && isObject(body.results) && Array.isArray(body.results.bindings)
          ? (body.results.bindings as unknown[])
          : null;
      if (!bindings) return unexpected(base, "HTTP 200, kein results.bindings", searchUrl);
      if (bindings.length === 0) {
        return result(base, "not_found", {
          url: searchUrl,
          note:
            "Kein Wikidata-Eintrag mit diesem Label und Typ (geprüft: übliche Schreibweisen und die ersten 20 Suchtreffer), Marken nicht geprüft",
          evidence: "HTTP 200, 0 Treffer",
        });
      }

      const hits = new Map<string, Set<string>>();
      for (const b of bindings) {
        if (!isObject(b) || !isObject(b.item) || !isObject(b.type)) continue;
        const item = String(b.item.value ?? "");
        const type = String(b.type.value ?? "");
        const qid = item.match(/\/(Q\d+)$/)?.[1];
        const tid = type.match(/\/(Q\d+)$/)?.[1];
        if (!qid || !tid) continue;
        const set = hits.get(qid) ?? new Set<string>();
        set.add(WIKIDATA_TYPES[tid] ?? tid);
        hits.set(qid, set);
      }
      if (hits.size === 0) return unexpected(base, "HTTP 200, Treffer ohne Item", searchUrl);

      const [firstId, firstTypes] = hits.entries().next().value as [string, Set<string>];
      const typeText = Array.from(firstTypes).join(", ");
      const more =
        hits.size === 2 ? ", 1 weiterer Eintrag" : hits.size > 2 ? `, ${hits.size - 1} weitere Einträge` : "";
      return result(base, "taken", {
        url: `https://www.wikidata.org/wiki/${firstId}`,
        note: `Wikidata-Eintrag vorhanden (Typ: ${typeText})${more}`,
        evidence: `HTTP 200, ${Array.from(hits.keys()).slice(0, 5).join(", ")}`,
      });
    } catch {
      return unexpected(base, "interner Fehler", searchUrl);
    }
  },
};

// ---------------------------------------------------------------------------
// gleif: aktive Rechtsträger mit LEI, exakter Namensstamm
// ---------------------------------------------------------------------------

/** Rechtsform-Bestandteile, die am Ende eines Firmennamens entfernt werden (normalisiert). */
const LEGAL_FORM_TOKENS = new Set([
  "gmbh", "mbh", "ag", "se", "ug", "kg", "kgaa", "ohg", "gbr", "ev", "eg", "co", "cokg",
  "haftungsbeschraenkt", "haftungsbeschrankt", "inc", "incorporated", "ltd", "limited", "llc", "llp", "lp", "plc",
  "corp", "corporation", "company", "sa", "sas", "sarl", "srl", "spa", "bv", "nv", "ab",
  "as", "asa", "aps", "oy", "oyj", "pty", "pte", "kft", "sro", "sp", "z", "oo", "und",
]);

/** Kleinschreibung, Akzente weg, nur a-z0-9 je Wort; Rechtsform-Wörter am Ende entfernen. */
export function legalNameStem(legalName: string): string {
  const tokens = foldToAscii(legalName)
    .replace(/&/g, " und ")
    .split(/[\s,]+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  while (tokens.length > 1 && LEGAL_FORM_TOKENS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join("");
}

export function gleifApiUrl(name: string): string {
  const q = encodeURIComponent(name.replace(/-/g, " "));
  return `https://api.gleif.org/api/v1/lei-records?filter%5Bentity.legalName%5D=${q}&filter%5Bentity.status%5D=ACTIVE&page%5Bsize%5D=10`;
}

function gleifSearchUrl(name: string): string {
  return `https://search.gleif.org/#/search/simpleSearch=${encodeURIComponent(name.replace(/-/g, " "))}`;
}

const gleif: Source = {
  id: "gleif",
  namespace: NAMESPACE,
  label: "GLEIF",
  defaultEnabled: true,
  description:
    "GLEIF LEI-Register: aktive Rechtsträger weltweit mit LEI, Vergleich des Namensstamms ohne Rechtsform. Viele kleine Firmen haben keine LEI.",
  endpoint:
    "https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]={name}&filter[entity.status]=ACTIVE&page[size]=10",
  async check(name, ctx: CheckContext) {
    const base: Base = { sourceId: "gleif", label: "GLEIF", target: name };
    const searchUrl = gleifSearchUrl(name);
    try {
      if (!NAME_RE.test(name)) return invalidName(base);
      const res = await ctx.http.request(gleifApiUrl(name), {
        headers: { Accept: "application/vnd.api+json" },
        read: "json",
        maxBytes: 256 * 1024,
        retry: true,
      });
      const fail = failure(base, res, searchUrl);
      if (fail) return fail;
      if (res.status !== 200) return unexpected(base, `HTTP ${res.status}`, searchUrl);

      const body = res.json;
      if (!isObject(body) || !Array.isArray(body.data)) {
        return unexpected(base, "HTTP 200, kein data-Feld", searchUrl);
      }
      const pagination =
        isObject(body.meta) && isObject(body.meta.pagination) ? body.meta.pagination : null;
      const total = typeof pagination?.total === "number" ? pagination.total : body.data.length;
      const records: { lei: string; legalName: string }[] = [];
      for (const d of body.data as unknown[]) {
        if (!isObject(d) || !isObject(d.attributes) || !isObject(d.attributes.entity)) continue;
        const ln = d.attributes.entity.legalName;
        const legalName = isObject(ln) && typeof ln.name === "string" ? ln.name : "";
        const lei = typeof d.id === "string" ? d.id : String(d.attributes.lei ?? "");
        if (legalName) records.push({ lei, legalName });
      }

      if (total === 0 || records.length === 0) {
        if (total > 0) return unexpected(base, `HTTP 200, total ${total}, aber keine Datensätze`, searchUrl);
        return result(base, "not_found", {
          url: searchUrl,
          note: "Kein aktiver Rechtsträger mit LEI unter diesem Namen, Handelsregister nicht geprüft",
          evidence: "HTTP 200, total 0",
        });
      }

      const target = name.replace(/-/g, "");
      const exact = records.find((r) => legalNameStem(r.legalName) === target);
      if (exact) {
        return result(base, "taken", {
          url: exact.lei ? `https://search.gleif.org/#/record/${exact.lei}` : searchUrl,
          note: `Aktiver Rechtsträger „${exact.legalName}“`,
          evidence: `HTTP 200, total ${total}, LEI ${exact.lei}`,
        });
      }
      const names = Array.from(new Set(records.map((r) => r.legalName)));
      const shown = names.slice(0, 3);
      const moreNames = names.length > shown.length || total > records.length;
      return result(base, "similar", {
        url: searchUrl,
        note: `Ähnliche aktive Rechtsträger, kein exakter: ${shown.join(", ")}${moreNames ? " …" : ""}`,
        evidence: `HTTP 200, total ${total}`,
      });
    } catch {
      return unexpected(base, "interner Fehler", searchUrl);
    }
  },
};

// ---------------------------------------------------------------------------
// wikipedia: de.wikipedia, Titel-Treffer ohne Groß-/Kleinschreibung, schwaches Signal
// ---------------------------------------------------------------------------

/** Suchbegriff: Bindestriche als Leerzeichen ("trade-republic" => "trade republic"). */
function wikipediaTerm(name: string): string {
  return name.replace(/-/g, " ");
}

/**
 * MediaWiki-API mit Near-Match (Titel ohne Groß-/Kleinschreibung, auch "PostHog" für
 * "posthog"), Weiterleitungen aufgelöst, Begriffsklärung über pageprops erkennbar.
 * Eine Anfrage statt REST-Summary plus Ausweichabfrage.
 */
export function wikipediaApiUrl(name: string): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: wikipediaTerm(name),
    gsrwhat: "nearmatch",
    gsrnamespace: "0",
    gsrlimit: "1",
    redirects: "1",
    prop: "pageprops|info|description",
    ppprop: "disambiguation",
    inprop: "url",
  });
  return `https://de.wikipedia.org/w/api.php?${params.toString()}`;
}

function wikipediaSearchUrl(name: string): string {
  return `https://de.wikipedia.org/w/index.php?search=${encodeURIComponent(wikipediaTerm(name))}`;
}

const wikipedia: Source = {
  id: "wikipedia",
  namespace: NAMESPACE,
  label: "Wikipedia (de)",
  defaultEnabled: false,
  description:
    "Deutschsprachige Wikipedia: gibt es einen Artikel mit diesem Titel (ohne Groß-/Kleinschreibung, Bindestrich wie Leerzeichen)? Schwaches Signal, ein Artikel kann auch einen Begriff statt eines Produkts beschreiben.",
  endpoint:
    "https://de.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch={name}&gsrwhat=nearmatch&gsrlimit=1&redirects=1&prop=pageprops|info|description",
  async check(name, ctx: CheckContext) {
    const base: Base = { sourceId: "wikipedia", label: "Wikipedia (de)", target: name };
    const searchUrl = wikipediaSearchUrl(name);
    try {
      if (!NAME_RE.test(name)) return { ...invalidName(base), weak: true };
      const res = await ctx.http.request(wikipediaApiUrl(name), {
        headers: { Accept: "application/json" },
        read: "json",
        maxBytes: 16 * 1024,
      });
      const fail = failure(base, res, searchUrl);
      if (fail) return { ...fail, weak: true };
      if (res.status !== 200) return { ...unexpected(base, `HTTP ${res.status}`, searchUrl), weak: true };

      const body = res.json;
      if (!isObject(body)) return { ...unexpected(base, "HTTP 200, kein JSON-Objekt", searchUrl), weak: true };
      if (isObject(body.error)) {
        const code = typeof body.error.code === "string" ? body.error.code : "error";
        return { ...unexpected(base, `HTTP 200, error ${code}`, searchUrl), weak: true };
      }
      // Ohne Treffer liefert die API kein query-Feld (nur batchcomplete).
      if (body.query === undefined) {
        if (body.batchcomplete === undefined) {
          return { ...unexpected(base, "HTTP 200, weder query noch batchcomplete", searchUrl), weak: true };
        }
        return result(base, "not_found", {
          url: searchUrl,
          note: "Kein Artikel mit diesem Titel, nur Hinweis",
          evidence: "HTTP 200, 0 Treffer",
          weak: true,
        });
      }
      const pages = isObject(body.query) && Array.isArray(body.query.pages) ? (body.query.pages as unknown[]) : null;
      const page = pages?.find((p) => isObject(p) && typeof p.title === "string" && p.missing === undefined);
      if (!pages || (pages.length > 0 && !isObject(page))) {
        return { ...unexpected(base, "HTTP 200, query ohne verwertbare pages", searchUrl), weak: true };
      }
      if (!isObject(page)) {
        return result(base, "not_found", {
          url: searchUrl,
          note: "Kein Artikel mit diesem Titel, nur Hinweis",
          evidence: "HTTP 200, 0 Treffer",
          weak: true,
        });
      }
      const title = String(page.title);
      const pageUrl =
        typeof page.fullurl === "string"
          ? page.fullurl
          : `https://de.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

      if (isObject(page.pageprops) && "disambiguation" in page.pageprops) {
        return result(base, "similar", {
          url: pageUrl,
          note: "Begriffsklärungsseite: mehrere Bedeutungen, nur Hinweis",
          evidence: `HTTP 200, Begriffsklärung „${title}“`,
          weak: true,
        });
      }
      const desc = typeof page.description === "string" && page.description ? ` (${page.description})` : "";
      return result(base, "taken", {
        url: pageUrl,
        note: `Artikel „${title}“${desc}, nur Hinweis`,
        evidence: `HTTP 200, Seite ${typeof page.pageid === "number" ? page.pageid : title}`,
        weak: true,
      });
    } catch {
      return { ...unexpected(base, "interner Fehler", searchUrl), weak: true };
    }
  },
};

// ---------------------------------------------------------------------------
// hn_show: Hacker News Show HN (Algolia), schwaches Signal
// ---------------------------------------------------------------------------

export function hnApiUrl(name: string): string {
  return `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(`"${name}"`)}&tags=show_hn&hitsPerPage=20&attributesToRetrieve=title,objectID&attributesToHighlight=none`;
}

function hnSearchUrl(name: string): string {
  return `https://hn.algolia.com/?dateRange=all&page=0&prefix=false&query=${encodeURIComponent(`"${name}"`)}&sort=byPopularity&type=show_hn`;
}

/** Titel stellt ein Produkt mit diesem Namen vor ("Show HN: Name ..."), nicht nur eine Erwähnung. */
export function isShowHnTitleFor(title: string, name: string): boolean {
  // Bindestrich im Namen passt auch auf Leerzeichen oder nichts ("trade-republic" =>
  // "Trade Republic", "TradeRepublic"). \b nach dem Namen, aber kein folgender Bindestrich
  // ("Dropbox-like" zählt nicht).
  const pattern = name.split("-").map(escapeRegExp).join("[\\s-]?");
  return new RegExp(`^Show HN:\\s*${pattern}\\b(?!-)`, "i").test(title);
}

const hnShow: Source = {
  id: "hn_show",
  namespace: NAMESPACE,
  label: "Show HN",
  defaultEnabled: false,
  description:
    "Hacker News (Algolia-Suche): gab es eine Produktvorstellung „Show HN: Name“? Schwaches Signal.",
  endpoint:
    'https://hn.algolia.com/api/v1/search?query="{name}"&tags=show_hn&hitsPerPage=20&attributesToRetrieve=title,objectID&attributesToHighlight=none',
  async check(name, ctx: CheckContext) {
    const base: Base = { sourceId: "hn_show", label: "Show HN", target: name };
    const searchUrl = hnSearchUrl(name);
    try {
      if (!NAME_RE.test(name)) return { ...invalidName(base), weak: true };
      const res = await ctx.http.request(hnApiUrl(name), { read: "json", maxBytes: 32 * 1024 });
      const fail = failure(base, res, searchUrl);
      if (fail) return { ...fail, weak: true };
      if (res.status !== 200) return { ...unexpected(base, `HTTP ${res.status}`, searchUrl), weak: true };

      const body = res.json;
      if (!isObject(body) || !Array.isArray(body.hits)) {
        return { ...unexpected(base, "HTTP 200, kein hits-Feld", searchUrl), weak: true };
      }
      const nbHits = typeof body.nbHits === "number" ? body.nbHits : body.hits.length;
      for (const h of body.hits as unknown[]) {
        if (!isObject(h) || typeof h.title !== "string") continue;
        if (isShowHnTitleFor(h.title, name)) {
          const id = typeof h.objectID === "string" ? h.objectID : "";
          return result(base, "taken", {
            url: id ? `https://news.ycombinator.com/item?id=${id}` : searchUrl,
            note: `Vorgestellt als „${h.title.slice(0, 100)}“, nur Hinweis`,
            evidence: `HTTP 200, nbHits ${nbHits}`,
            weak: true,
          });
        }
      }
      return result(base, "not_found", {
        url: searchUrl,
        note:
          nbHits > 0
            ? `Keine Show-HN-Vorstellung unter diesem Namen, aber ${nbHits} Erwähnungen`
            : "Keine Show-HN-Vorstellung unter diesem Namen",
        evidence: `HTTP 200, nbHits ${nbHits}`,
        weak: true,
      });
    } catch {
      return { ...unexpected(base, "interner Fehler", searchUrl), weak: true };
    }
  },
};

export const KNOWN_NAME_SOURCES: Source[] = [knownBrands, wikidata, gleif, wikipedia, hnShow];
