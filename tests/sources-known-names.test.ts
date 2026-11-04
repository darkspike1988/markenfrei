import { test } from "node:test";
import assert from "node:assert/strict";
import type { CheckContext, HttpRequest, HttpResponse, Source } from "@/lib/engine/types";
import {
  buildWikidataQuery,
  gleifApiUrl,
  hnApiUrl,
  isShowHnTitleFor,
  KNOWN_NAME_SOURCES,
  legalNameStem,
  matchKnownBrands,
  wikidataApiUrl,
  wikipediaApiUrl,
} from "@/lib/engine/sources/known-names";

type Call = { url: string; req: HttpRequest };

/** Fake-HttpClient: liefert je URL eine feste Antwort, protokolliert alle Aufrufe. */
function fakeCtx(responses: Record<string, Partial<HttpResponse>> | ((url: string) => Partial<HttpResponse>)) {
  const calls: Call[] = [];
  const ctx: CheckContext = {
    contact: "",
    http: {
      async request(url, req = {}) {
        calls.push({ url, req });
        const r = typeof responses === "function" ? responses(url) : responses[url];
        if (!r) throw new Error(`keine Antwort für ${url}`);
        return { status: 200, headers: new Headers(), ...r };
      },
    },
  };
  return { ctx, calls };
}

function source(id: string): Source {
  const s = KNOWN_NAME_SOURCES.find((x) => x.id === id);
  assert.ok(s, `Quelle ${id} fehlt`);
  return s;
}

test("KNOWN_NAME_SOURCES: ids, Namensraum und Standardauswahl", () => {
  assert.deepEqual(
    KNOWN_NAME_SOURCES.map((s) => [s.id, s.defaultEnabled]),
    [
      ["known_brands", true],
      ["wikidata", true],
      ["gleif", true],
      ["wikipedia", false],
      ["hn_show", false],
    ],
  );
  for (const s of KNOWN_NAME_SOURCES) assert.equal(s.namespace, "known_names");
});

test("alle Quellen: ungültiger Name => invalid ohne Netz", async () => {
  for (const s of KNOWN_NAME_SOURCES) {
    for (const bad of ["a", "-abc", "abc-", "Abc", "ab_c", "a".repeat(64)]) {
      const { ctx, calls } = fakeCtx(() => ({ status: 500 }));
      const r = await s.check(bad, ctx);
      assert.equal(r.status, "invalid", `${s.id} ${bad}`);
      assert.equal(calls.length, 0);
    }
  }
});

// --- known_brands -----------------------------------------------------------

test("known_brands: identisch => taken, ohne Netz", async () => {
  const { ctx, calls } = fakeCtx({});
  const r = await source("known_brands").check("github", ctx);
  assert.equal(r.status, "taken");
  assert.equal(calls.length, 0);
  assert.match(r.url ?? "", /tmview.*basicSearch=github/);
});

test("known_brands: Bindestrich-Schreibweise der Marke => taken", async () => {
  const r = await source("known_brands").check("trade-republic", fakeCtx({}).ctx);
  assert.equal(r.status, "taken");
});

test("known_brands: klanggleich (Phonetik gleich, Levenshtein <= 2, Code >= 4) => similar", async () => {
  const r = await source("known_brands").check("clarna", fakeCtx({}).ctx);
  assert.equal(r.status, "similar");
  assert.match(r.evidence ?? "", /klanggleich mit klarna/);
});

test("known_brands: klanggleich mit zu kurzem Code zählt nicht", () => {
  // "uber" und "ubr" haben beide den Code "017" (zu kurz)
  assert.equal(matchKnownBrands("ubr").length, 0);
});

test("known_brands: klanggleich mit zu großer Levenshtein-Distanz zählt nicht", () => {
  // gleicher Code wie "klarna" (4576), aber Levenshtein 3
  const m = matchKnownBrands("clahrrna", ["klarna"]);
  assert.equal(m.length, 0);
});

test("known_brands: enthalten an Wortgrenze (Anfang, Ende, Bindestrich) => similar", async () => {
  for (const n of ["githubber", "mygithub", "my-github-tool", "slackbot-github"]) {
    const r = await source("known_brands").check(n, fakeCtx({}).ctx);
    assert.equal(r.status, "similar", n);
  }
});

test("known_brands: enthalten nur bei Marken ab 5 Zeichen und an Wortgrenze", () => {
  // "meta" (4 Zeichen) am Anfang zählt nicht; "github" mitten im Wort zählt nicht
  assert.equal(matchKnownBrands("metaphor", ["meta"]).length, 0);
  assert.equal(matchKnownBrands("xgithubx", ["github"]).length, 0);
});

test("known_brands: kein Treffer => not_found mit Hinweis auf die Grenze", async () => {
  const r = await source("known_brands").check("zzqxkvjwabc", fakeCtx({}).ctx);
  assert.equal(r.status, "not_found");
  assert.equal(r.note, "nur 89 bekannte Marken geprüft, kein Register");
});

// --- wikidata ---------------------------------------------------------------

const wdUrl = wikidataApiUrl("spotify");

test("wikidata: Abfrage enthält Label-Vergleich, Sprachen und alle Typen", () => {
  const q = buildWikidataQuery("trade-republic");
  assert.match(q, /mwapi:search "trade republic"/);
  assert.match(q, /LCASE\(STR\(\?label\)\) IN \("trade-republic", "trade republic"\)/);
  // "mul" (sprachübergreifendes Label) muss zugelassen sein, sonst falsches not_found
  assert.match(q, /FILTER\(LANG\(\?label\) IN \("de", "en", "mul"\)\)/);
  // ohne Leer- und Satzzeichen: Label "Trade Republic" passt auf "traderepublic"
  assert.match(q, /REPLACE\(LCASE\(STR\(\?label\)\), "\[\^a-z0-9\]", ""\) = "traderepublic"/);
  assert.match(q, /\?item wdt:P31\/wdt:P279\* \?type/);
  for (const t of ["Q4830453", "Q431289", "Q7397", "Q35127", "Q620615", "Q2424752"]) {
    assert.ok(q.includes(`wd:${t}`), t);
  }
  assert.ok(wdUrl.startsWith("https://query.wikidata.org/sparql?query="));
  assert.equal(decodeURIComponent(wdUrl.split("?query=")[1]), buildWikidataQuery("spotify"));
});

test("wikidata: direkte Label-Abfrage übliche Schreibweisen in de, en und mul (nicht nur Top 20 der Suche)", () => {
  const q = buildWikidataQuery("trade-republic");
  assert.match(q, /mwapi:limit "20"/);
  assert.match(q, /\} UNION \{/);
  assert.match(q, /\?item rdfs:label \?exact/);
  for (const lit of ['"Trade Republic"@mul', '"Trade Republic"@en', '"Trade Republic"@de', '"trade-republic"@en', '"TRADE REPUBLIC"@en']) {
    assert.ok(q.includes(lit), lit);
  }
  const single = buildWikidataQuery("signal");
  for (const lit of ['"signal"@mul', '"Signal"@en', '"SIGNAL"@de']) assert.ok(single.includes(lit), lit);
});

test("wikidata: Treffer => taken mit Item-Link und Typ", async () => {
  const { ctx, calls } = fakeCtx({
    [wdUrl]: {
      json: {
        head: { vars: ["item", "type"] },
        results: {
          bindings: [
            { item: { value: "http://www.wikidata.org/entity/Q689141" }, type: { value: "http://www.wikidata.org/entity/Q431289" } },
            { item: { value: "http://www.wikidata.org/entity/Q689141" }, type: { value: "http://www.wikidata.org/entity/Q7397" } },
          ],
        },
      },
    },
  });
  const r = await source("wikidata").check("spotify", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://www.wikidata.org/wiki/Q689141");
  assert.match(r.note ?? "", /Typ: Marke, Software/);
  assert.equal(calls[0].req.headers?.Accept, "application/sparql-results+json");
  assert.equal(calls[0].req.timeoutMs, 5000);
  assert.equal(calls[0].req.read, "json");
});

test("wikidata: leere bindings => not_found mit Suchlink", async () => {
  const { ctx } = fakeCtx({ [wdUrl]: { json: { results: { bindings: [] } } } });
  const r = await source("wikidata").check("spotify", ctx);
  assert.equal(r.status, "not_found");
  assert.equal(r.url, "https://www.wikidata.org/w/index.php?search=spotify");
  assert.match(r.note ?? "", /ersten 20 Suchtreffer/);
});

test("wikidata: 429, Timeout und falsches Format => unknown", async () => {
  const cases: Partial<HttpResponse>[] = [
    { status: 429, headers: new Headers({ "retry-after": "30" }) },
    { status: 0, error: "timeout" },
    { status: 503 },
    { json: { error: "x" } },
    { status: 200, text: "<html>", error: "parse" },
  ];
  for (const c of cases) {
    const r = await source("wikidata").check("spotify", fakeCtx({ [wdUrl]: c }).ctx);
    assert.equal(r.status, "unknown", JSON.stringify(c));
    assert.ok(r.note && r.evidence);
  }
  const r429 = await source("wikidata").check("spotify", fakeCtx({ [wdUrl]: cases[0] }).ctx);
  assert.equal(r429.evidence, "HTTP 429, Retry-After 30");
});

// --- gleif ------------------------------------------------------------------

test("gleif: gebaute URL", () => {
  assert.equal(
    gleifApiUrl("personio"),
    "https://api.gleif.org/api/v1/lei-records?filter%5Bentity.legalName%5D=personio&filter%5Bentity.status%5D=ACTIVE&page%5Bsize%5D=10",
  );
  assert.match(gleifApiUrl("trade-republic"), /legalName%5D=trade%20republic&/);
});

test("gleif: Namensstamm ohne Rechtsform", () => {
  assert.equal(legalNameStem("Personio SE & Co. KG"), "personio");
  assert.equal(legalNameStem("Trade Republic Bank GmbH"), "traderepublicbank");
  assert.equal(legalNameStem("Foo UG (haftungsbeschränkt)"), "foo");
  assert.equal(legalNameStem("ACME, Inc."), "acme");
  assert.equal(legalNameStem("Personio Foundation"), "personiofoundation");
  assert.equal(legalNameStem("AG"), "ag");
});

function gleifBody(total: number, names: [string, string][]) {
  return {
    meta: { pagination: { total } },
    data: names.map(([lei, name]) => ({
      type: "lei-records",
      id: lei,
      attributes: { lei, entity: { legalName: { name }, status: "ACTIVE" } },
    })),
  };
}

test("gleif: exakter Stamm => taken mit Link auf den Datensatz", async () => {
  const { ctx, calls } = fakeCtx({
    [gleifApiUrl("personio")]: {
      json: gleifBody(2, [
        ["LEI1", "Personio Foundation"],
        ["LEI2", "Personio SE & Co. KG"],
      ]),
    },
  });
  const r = await source("gleif").check("personio", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://search.gleif.org/#/record/LEI2");
  assert.equal(calls[0].req.headers?.Accept, "application/vnd.api+json");
});

test("gleif: nur Teilwort-Treffer => similar", async () => {
  const { ctx } = fakeCtx({
    [gleifApiUrl("personio")]: { json: gleifBody(1, [["LEI1", "Personio Foundation"]]) },
  });
  const r = await source("gleif").check("personio", ctx);
  assert.equal(r.status, "similar");
  assert.match(r.note ?? "", /Personio Foundation/);
});

test("gleif: similar-Hinweis ohne doppelte Namen (Zweigniederlassungen)", async () => {
  const { ctx } = fakeCtx({
    [gleifApiUrl("trade-republic")]: {
      json: gleifBody(13, [
        ["L1", "Trade Republic Bank GmbH"],
        ["L2", "Trade Republic Bank GmbH"],
        ["L3", "Trade Republic Bank GmbH"],
        ["L4", "Trade Republic Holding GmbH"],
      ]),
    },
  });
  const r = await source("gleif").check("trade-republic", ctx);
  assert.equal(r.status, "similar");
  assert.equal(r.note, "Ähnliche aktive Rechtsträger, kein exakter: Trade Republic Bank GmbH, Trade Republic Holding GmbH …");
});

test("gleif: total 0 => not_found", async () => {
  const { ctx } = fakeCtx({ [gleifApiUrl("zzqxkvjwabc")]: { json: gleifBody(0, []) } });
  const r = await source("gleif").check("zzqxkvjwabc", ctx);
  assert.equal(r.status, "not_found");
  assert.match(r.url ?? "", /search\.gleif\.org/);
});

test("gleif: 429, 500, Netzfehler und falsches Format => unknown", async () => {
  const url = gleifApiUrl("personio");
  for (const c of [{ status: 429 }, { status: 500 }, { status: 0, error: "network" as const }, { json: { errors: [] } }, { status: 400, json: {} }]) {
    const r = await source("gleif").check("personio", fakeCtx({ [url]: c }).ctx);
    assert.equal(r.status, "unknown", JSON.stringify(c));
  }
});

// --- wikipedia --------------------------------------------------------------

test("wikipedia: gebaute URL (Near-Match, Bindestrich als Leerzeichen)", () => {
  const u = new URL(wikipediaApiUrl("trade-republic"));
  assert.equal(u.origin + u.pathname, "https://de.wikipedia.org/w/api.php");
  assert.equal(u.searchParams.get("gsrsearch"), "trade republic");
  assert.equal(u.searchParams.get("gsrwhat"), "nearmatch");
  assert.equal(u.searchParams.get("generator"), "search");
  assert.equal(u.searchParams.get("gsrlimit"), "1");
  assert.equal(u.searchParams.get("redirects"), "1");
  assert.equal(u.searchParams.get("ppprop"), "disambiguation");
  assert.equal(u.searchParams.get("formatversion"), "2");
});

function wpPage(page: Record<string, unknown>) {
  return { batchcomplete: true, query: { pages: [{ ns: 0, ...page }] } };
}

test("wikipedia: Artikel => taken weak (auch mit anderer Schreibweise, z. B. Trade Republic)", async () => {
  const { ctx, calls } = fakeCtx({
    [wikipediaApiUrl("trade-republic")]: {
      json: wpPage({
        pageid: 10443870,
        title: "Trade Republic",
        description: "deutsche Neobank",
        fullurl: "https://de.wikipedia.org/wiki/Trade_Republic",
      }),
    },
  });
  const r = await source("wikipedia").check("trade-republic", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.weak, true);
  assert.equal(r.url, "https://de.wikipedia.org/wiki/Trade_Republic");
  assert.match(r.note ?? "", /„Trade Republic“ \(deutsche Neobank\), nur Hinweis/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].req.read, "json");
  assert.ok((calls[0].req.maxBytes ?? 0) <= 16 * 1024);
});

test("wikipedia: Begriffsklärung ist kein Treffer => similar weak", async () => {
  const { ctx } = fakeCtx({
    [wikipediaApiUrl("merkur")]: { json: wpPage({ pageid: 1, title: "Merkur", pageprops: { disambiguation: "" } }) },
  });
  const r = await source("wikipedia").check("merkur", ctx);
  assert.equal(r.status, "similar");
  assert.equal(r.weak, true);
  assert.equal(r.url, "https://de.wikipedia.org/wiki/Merkur");
});

test("wikipedia: kein Treffer => not_found weak, 429, 503 und error-Feld => unknown weak", async () => {
  const url = wikipediaApiUrl("zzqxkvjwabc");
  const nf = await source("wikipedia").check("zzqxkvjwabc", fakeCtx({ [url]: { json: { batchcomplete: true } } }).ctx);
  assert.equal(nf.status, "not_found");
  assert.equal(nf.weak, true);
  assert.equal(nf.url, "https://de.wikipedia.org/w/index.php?search=zzqxkvjwabc");
  for (const status of [429, 503]) {
    const r = await source("wikipedia").check("zzqxkvjwabc", fakeCtx({ [url]: { status } }).ctx);
    assert.equal(r.status, "unknown");
    assert.equal(r.weak, true);
    assert.equal(r.evidence, `HTTP ${status}`);
  }
  for (const json of [{ error: { code: "maxlag", info: "x" } }, { foo: 1 }, { batchcomplete: true, query: { pages: [1] } }]) {
    const r = await source("wikipedia").check("zzqxkvjwabc", fakeCtx({ [url]: { json } }).ctx);
    assert.equal(r.status, "unknown", JSON.stringify(json));
    assert.equal(r.weak, true);
  }
});

// --- hn_show ----------------------------------------------------------------

test("hn_show: gebaute URL", () => {
  assert.equal(
    hnApiUrl("pocketbase"),
    "https://hn.algolia.com/api/v1/search?query=%22pocketbase%22&tags=show_hn&hitsPerPage=20&attributesToRetrieve=title,objectID&attributesToHighlight=none",
  );
});

test("hn_show: Titelregel", () => {
  assert.equal(isShowHnTitleFor("Show HN: PocketBase – backend in one file", "pocketbase"), true);
  assert.equal(isShowHnTitleFor("Show HN:PocketBase", "pocketbase"), true);
  assert.equal(isShowHnTitleFor("Show HN: PocketBaseX", "pocketbase"), false);
  assert.equal(isShowHnTitleFor("Show HN: Hearth – A Dropbox-like publisher", "dropbox"), false);
  assert.equal(isShowHnTitleFor("Show HN: Dropbox-like sync", "dropbox"), false);
  assert.equal(isShowHnTitleFor("Show HN: my-tool, a CLI", "my-tool"), true);
  // Bindestrich im Namen passt auf Leerzeichen oder Zusammenschreibung
  assert.equal(isShowHnTitleFor("Show HN: Trade Republic – investing app", "trade-republic"), true);
  assert.equal(isShowHnTitleFor("Show HN: TradeRepublic", "trade-republic"), true);
  assert.equal(isShowHnTitleFor("Show HN: Trade Republican", "trade-republic"), false);
  assert.equal(isShowHnTitleFor("Show HN: Trade Republic-like app", "trade-republic"), false);
});

test("hn_show: Vorstellung => taken weak mit Link auf den Beitrag", async () => {
  const { ctx, calls } = fakeCtx({
    [hnApiUrl("pocketbase")]: {
      json: { nbHits: 2, hits: [{ title: "Show HN: Uses PocketBase", objectID: "1" }, { title: "Show HN: PocketBase – x", objectID: "32013330" }] },
    },
  });
  const r = await source("hn_show").check("pocketbase", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.weak, true);
  assert.equal(r.url, "https://news.ycombinator.com/item?id=32013330");
  assert.ok((calls[0].req.maxBytes ?? 0) <= 32 * 1024);
});

test("hn_show: nur Erwähnungen oder nichts => not_found weak", async () => {
  const mention = await source("hn_show").check(
    "dropbox",
    fakeCtx({ [hnApiUrl("dropbox")]: { json: { nbHits: 417, hits: [{ title: "Show HN: Hearth – A Dropbox-like publisher", objectID: "9" }] } } }).ctx,
  );
  assert.equal(mention.status, "not_found");
  assert.match(mention.note ?? "", /417 Erwähnungen/);
  const none = await source("hn_show").check(
    "zzqxkvjwabc",
    fakeCtx({ [hnApiUrl("zzqxkvjwabc")]: { json: { nbHits: 0, hits: [] } } }).ctx,
  );
  assert.equal(none.status, "not_found");
  assert.equal(none.weak, true);
});

test("hn_show: 429, Deadline und falsches Format => unknown weak", async () => {
  const url = hnApiUrl("pocketbase");
  for (const c of [{ status: 429 }, { status: 0, error: "deadline" as const }, { json: { message: "x" } }]) {
    const r = await source("hn_show").check("pocketbase", fakeCtx({ [url]: c }).ctx);
    assert.equal(r.status, "unknown", JSON.stringify(c));
    assert.equal(r.weak, true);
  }
});

test("keine Quelle wirft, auch wenn der HttpClient wirft", async () => {
  const ctx: CheckContext = {
    contact: "",
    http: {
      async request() {
        throw new Error("boom");
      },
    },
  };
  for (const s of KNOWN_NAME_SOURCES) {
    const r = await s.check("spotify", ctx);
    assert.ok(r.status === "unknown" || s.id === "known_brands", s.id);
  }
});
