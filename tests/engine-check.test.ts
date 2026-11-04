import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CheckInputError, checkName, checkNames, clearResultCache, resolveSources } from "@/lib/engine/check";
import type { Source, Status } from "@/lib/engine/types";
import { computeVerdict } from "@/lib/engine/verdict";

function fake(id: string, status: Status | ((n: string) => Status), opts: Partial<Source> & { weak?: boolean; throws?: boolean } = {}) {
  let calls = 0;
  const s: Source & { calls: () => number } = {
    id,
    namespace: opts.namespace ?? "packages",
    label: id,
    defaultEnabled: opts.defaultEnabled ?? true,
    description: "",
    endpoint: "",
    async check(name) {
      calls++;
      if (opts.throws) throw new Error("boom");
      const st = typeof status === "function" ? status(name) : status;
      return { sourceId: id, namespace: s.namespace, label: id, target: name, status: st, weak: opts.weak };
    },
    calls: () => calls,
  };
  return s;
}

beforeEach(() => clearResultCache());

test("Ampel: rot bei vergeben oder unzulässig, grün nur wenn alles nicht gefunden", () => {
  const r = (status: Status, weak = false) => ({ sourceId: "x", namespace: "packages" as const, label: "x", target: "n", status, weak });
  assert.equal(computeVerdict([r("not_found"), r("not_found")]), "green");
  assert.equal(computeVerdict([r("not_found"), r("taken")]), "red");
  assert.equal(computeVerdict([r("not_found"), r("invalid")]), "red");
  assert.equal(computeVerdict([r("not_found"), r("unknown")]), "yellow");
  assert.equal(computeVerdict([r("not_found"), r("similar")]), "yellow");
  assert.equal(computeVerdict([r("not_found"), r("taken", true)]), "yellow", "schwacher Treffer höchstens gelb");
  assert.equal(computeVerdict([]), "yellow");
});

test("Standardauswahl nimmt nur defaultEnabled-Quellen der gewählten Namensräume", () => {
  const reg = [fake("a", "not_found"), fake("b", "not_found", { defaultEnabled: false }), fake("c", "not_found", { namespace: "social" })];
  assert.deepEqual(resolveSources({ registry: reg }).map((s) => s.id), ["a"]);
  assert.deepEqual(resolveSources({ registry: reg, namespaces: ["social"] }).map((s) => s.id), ["c"]);
  assert.deepEqual(resolveSources({ registry: reg, sources: ["b", "a"] }).map((s) => s.id), ["b", "a"]);
});

test("unbekannte Quellen, Namensräume und Endungen werden abgelehnt", () => {
  assert.throws(() => resolveSources({ registry: [], sources: ["nope"] }), CheckInputError);
  assert.throws(() => resolveSources({ registry: [], namespaces: ["xx" as never] }), CheckInputError);
  assert.throws(() => resolveSources({ tlds: ["constructor"] }), CheckInputError);
});

test("Bericht: normalisiert den Namen, zählt Status und meldet Lücken", async () => {
  const reg = [fake("npm", "not_found"), fake("gh", "unknown"), fake("x", "taken")];
  const r = await checkName("Müller", { registry: reg, now: () => 1_700_000_000_000 });
  assert.equal(r.name, "mueller");
  assert.equal(r.verdict, "red");
  assert.deepEqual(r.incomplete, ["gh"]);
  assert.equal(r.counts.taken, 1);
  assert.equal(r.trademark.status, "not_checked");
  assert.equal(r.checkedAt, new Date(1_700_000_000_000).toISOString());
});

test("eine werfende Quelle wird zu unknown statt die Prüfung abzubrechen", async () => {
  const r = await checkName("abc", { registry: [fake("boom", "taken", { throws: true }), fake("ok", "not_found")] });
  assert.equal(r.results.find((x) => x.sourceId === "boom")?.status, "unknown");
  assert.equal(r.verdict, "yellow");
});

test("eindeutige Ergebnisse kommen aus dem Cache, unknown wird neu abgefragt", async () => {
  const definite = fake("d", "taken");
  const flaky = fake("f", "unknown");
  await checkName("cachetest", { registry: [definite, flaky] });
  await checkName("cachetest", { registry: [definite, flaky] });
  assert.equal(definite.calls(), 1);
  assert.equal(flaky.calls(), 2);
});

test("ungültiger Name wirft einen Eingabefehler", async () => {
  await assert.rejects(checkName("-x-", { registry: [] }), CheckInputError);
});

test("Shortlist: frei zuerst, dann wenige Treffer; Grenzen werden geprüft", async () => {
  const reg = [fake("p", (n) => (n === "alpha" ? "taken" : "not_found")), fake("q", (n) => (n === "gamma" ? "unknown" : "not_found"))];
  const { ranking } = await checkNames(["alpha", "beta", "gamma"], { registry: reg });
  assert.deepEqual(ranking.map((r) => r.name), ["beta", "gamma", "alpha"]);
  assert.equal(ranking[0].freeInAll, true);
  assert.deepEqual(ranking[2].taken, ["p"]);
  await assert.rejects(checkNames([], { registry: reg }), CheckInputError);
  await assert.rejects(checkNames(Array.from({ length: 11 }, (_, i) => `n${i}x`), { registry: reg }), CheckInputError);
});
