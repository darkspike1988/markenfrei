import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { clearAllCaches } from "@/lib/cache";
import { performClearanceCheck } from "@/lib/clearance";
import { toPublicReport } from "@/lib/public-report";

const realFetch = globalThis.fetch;
before(() => {
  clearAllCaches();
  globalThis.fetch = (() => Promise.reject(new Error("offline"))) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  clearAllCaches();
});

test("öffentlicher Bericht hat ein festes Schema ohne Rohdaten und ohne KI-Felder", async () => {
  const pub = toPublicReport(await performClearanceCheck({ name: "google", tlds: ["de"] }));
  assert.equal(pub.schemaVersion, 1);
  assert.deepEqual(Object.keys(pub.categories).sort(), ["appStore", "domain", "packages", "trademark"]);
  assert.equal(pub.categories.trademark, "bad");
  assert.ok(pub.trademark.collisions.some((c) => c.brand === "google"));
  assert.ok(!("aiGroundedTm" in pub));
  assert.ok(!("domainPrices" in pub));
});

test("der Bericht übersteht JSON-Hin-und-zurück unverändert", async () => {
  const pub = toPublicReport(await performClearanceCheck({ name: "wachwerk", tlds: ["de", "com"] }));
  assert.deepEqual(JSON.parse(JSON.stringify(pub)), pub);
});

test("fehlende Quellen stehen im Bericht und der Score bleibt unter 80", async () => {
  const pub = toPublicReport(await performClearanceCheck({ name: "wachwerk", tlds: ["de"] }));
  assert.ok(pub.incomplete.length > 0);
  assert.ok(pub.score <= 79);
  assert.notEqual(pub.verdict, "grün");
});
