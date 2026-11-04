import { test } from "node:test";
import assert from "node:assert/strict";
import type { ClearanceReport } from "@/app/api/clearance/route";
import { analyzeTrademarkSafety } from "@/lib/phonetics";
import { categoryStatus, topSignals } from "@/lib/verdict";

/** Sauberer Bericht: alles frei, alle Quellen haben geantwortet. */
function report(over: Partial<ClearanceReport> = {}): ClearanceReport {
  return {
    name: "fokusnova",
    checkedAt: "2026-11-04T00:00:00.000Z",
    domains: [
      { tld: "de", domain: "fokusnova.de", status: "available", method: "rdap", registrarLinks: {} },
      { tld: "com", domain: "fokusnova.com", status: "available", method: "rdap", registrarLinks: {} },
    ],
    trademark: analyzeTrademarkSafety("fokusnova"),
    wikidataHits: [],
    wikipediaHit: null,
    duckDuckGoHit: null,
    domainPrices: {},
    incomplete: [],
    appStore: { status: "clear", hits: [], bundleIds: [] },
    devAndSocial: {
      githubHandle: "available",
      npmPackage: "available",
      pypiPackage: "available",
      cratesIo: "available",
      homebrew: "available",
      golangModule: "available",
      topRepos: [],
    },
    ...over,
  } as unknown as ClearanceReport;
}

test("sauberer Bericht: alle vier Bereiche unauffällig", () => {
  assert.deepEqual(categoryStatus(report()), {
    domain: "ok",
    trademark: "ok",
    appStore: "ok",
    packages: "ok",
  });
});

test("identische Marke ergibt Konflikt bei Marke", () => {
  const r = report({ trademark: analyzeTrademarkSafety("google") });
  assert.equal(categoryStatus(r).trademark, "bad");
});

test("alle Domains vergeben: Konflikt; eine unbekannt: prüfen", () => {
  const taken = report({
    domains: report().domains.map((d) => ({ ...d, status: "taken" as const })),
  });
  assert.equal(categoryStatus(taken).domain, "bad");

  const mixed = report();
  mixed.domains[1] = { ...mixed.domains[1], status: "unknown" };
  assert.equal(categoryStatus(mixed).domain, "warn");
});

test("App-Store-Kollision ist ein Konflikt, vergebene Bundle-ID nur prüfen", () => {
  assert.equal(
    categoryStatus(report({ appStore: { status: "collision", hits: [], bundleIds: [] } })).appStore,
    "bad",
  );
  const taken = report({
    appStore: {
      status: "clear",
      hits: [],
      bundleIds: [{ bundleId: "de.x.app", appleStatus: "taken", googlePlayStatus: "available" }],
    },
  });
  assert.equal(categoryStatus(taken).appStore, "warn");
});

test("vergebener npm-Name: Pakete prüfen", () => {
  const r = report();
  r.devAndSocial.npmPackage = "taken";
  assert.equal(categoryStatus(r).packages, "warn");
});

test("fehlende Quellen werden nie als unauffällig gezeigt", () => {
  const r = report({ incomplete: ["Wikidata", "App Store", "Entwickler-Namensräume"] });
  const c = categoryStatus(r);
  assert.equal(c.trademark, "warn");
  assert.equal(c.appStore, "warn");
  assert.equal(c.packages, "warn");
});

test("topSignals liefert höchstens n Gründe, schwerste zuerst", () => {
  const r = report({
    trademark: analyzeTrademarkSafety("google"),
    appStore: { status: "collision", hits: [], bundleIds: [] },
    incomplete: ["Wikidata"],
  });
  r.devAndSocial.npmPackage = "taken";
  const s = topSignals(r, 3);
  assert.ok(s.length <= 3);
  assert.equal(s[0].tone, "bad");
  const rank = { bad: 0, warn: 1, ok: 2 } as const;
  for (let i = 1; i < s.length; i++) assert.ok(rank[s[i - 1].tone] <= rank[s[i].tone]);
});
