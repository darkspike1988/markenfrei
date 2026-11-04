import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { clearAllCaches } from "@/lib/cache";
import { performClearanceCheck } from "@/lib/clearance";

const realFetch = globalThis.fetch;
let calls: string[] = [];

function respond(url: string): Response {
  if (url.includes("wikidata.org")) return Response.json({ search: [] });
  if (url.includes("itunes.apple.com")) return Response.json({ results: [] }); // Suche und Bundle-Lookup
  return new Response("{}", { status: 404 }); // RDAP, Pakete, Stores: eindeutig "frei"
}

before(() => {
  clearAllCaches();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return respond(url);
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  clearAllCaches();
});

test("zweite Prüfung desselben Namens fragt eindeutige Quellen nicht erneut ab", async () => {
  calls = [];
  const first = await performClearanceCheck({ name: "cachename", tlds: ["de", "com"] });
  const firstCount = calls.length;
  assert.ok(firstCount > 10, `erste Prüfung: ${firstCount} Abfragen`);
  assert.deepEqual(first.incomplete, []);

  calls = [];
  const second = await performClearanceCheck({ name: "cachename", tlds: ["de", "com"] });
  const cachedHosts = ["rdap.denic.de", "rdap.verisign.com", "wikidata.org", "itunes.apple.com", "api.github.com", "registry.npmjs.org", "pypi.org", "play.google.com"];
  for (const host of cachedHosts) {
    assert.equal(calls.filter((u) => u.includes(host)).length, 0, `${host} wurde erneut abgefragt`);
  }
  assert.equal(second.matrixScore.totalScore, first.matrixScore.totalScore);
});
