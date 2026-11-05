import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CheckInputError, checkName, checkNames, clearResultCache, resolveSources } from "@/lib/engine/check";
import type { Source, Status } from "@/lib/engine/types";
import { computeVerdict, rankReports } from "@/lib/engine/verdict";

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

test("Ampel: rot nur bei hartem vergeben, grün nur wenn alles nicht gefunden (v2-spec)", () => {
  const r = (status: Status, weak = false) => ({ sourceId: "x", namespace: "packages" as const, label: "x", target: "n", status, weak });
  assert.equal(computeVerdict([r("not_found"), r("not_found")]), "green");
  assert.equal(computeVerdict([r("not_found"), r("taken")]), "red");
  assert.equal(computeVerdict([r("not_found"), r("invalid")]), "yellow", "unzulässig ist nicht vergeben");
  assert.equal(computeVerdict([r("invalid"), r("invalid")]), "yellow");
  assert.equal(computeVerdict([r("invalid"), r("taken")]), "red");
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

test("Shortlist: Doppelte nach der Normalisierung zählen einmal, die erste Eingabe bleibt", async () => {
  const p = fake("p", "not_found");
  for (const [inputs, kept] of [
    [["Foo", "foo", "bar"], ["foo", "bar"]],
    [["Müller", "mueller"], ["mueller"]],
    [["foo.com", "FOO"], ["foo"]],
  ] as const) {
    clearResultCache();
    const { ranking, reports } = await checkNames([...inputs], { registry: [p] });
    assert.deepEqual(reports.map((r) => r.name), kept);
    assert.deepEqual(ranking.map((r) => r.name).sort(), [...kept].sort());
    assert.equal(reports[0].input, inputs[0], "die erste Schreibweise bleibt als Eingabe erhalten");
  }
});

test("Shortlist: unzulässig zählt nicht als vergeben, rangiert aber hinter sauberen Namen", () => {
  const r = (label: string, status: Status) => ({ sourceId: label, namespace: "packages" as const, label, target: "n", status });
  const ranking = rankReports([
    { name: "inv", verdict: computeVerdict([r("a", "invalid"), r("b", "not_found")]), results: [r("a", "invalid"), r("b", "not_found")] },
    { name: "gap", verdict: computeVerdict([r("a", "unknown"), r("b", "not_found")]), results: [r("a", "unknown"), r("b", "not_found")] },
    { name: "hit", verdict: computeVerdict([r("a", "taken"), r("b", "invalid")]), results: [r("a", "taken"), r("b", "invalid")] },
  ]);
  assert.deepEqual(ranking.map((e) => e.name), ["gap", "inv", "hit"]);
  const inv = ranking.find((e) => e.name === "inv")!;
  assert.equal(inv.verdict, "yellow");
  assert.deepEqual(inv.taken, []);
  assert.deepEqual(inv.invalid, ["a"]);
  const hit = ranking.find((e) => e.name === "hit")!;
  assert.deepEqual(hit.taken, ["a"]);
  assert.deepEqual(hit.invalid, ["b"]);
});

test("Shortlist: ein ungültiger Name bricht ab, bevor irgendeine Quelle abgefragt wird", async () => {
  const p = fake("p", "not_found");
  const names = [...Array.from({ length: 9 }, (_, i) => `name${i}x`), "!"];
  await assert.rejects(checkNames(names, { registry: [p] }), CheckInputError);
  assert.equal(p.calls(), 0);
  await assert.rejects(checkNames(["gut", "-x-"], { registry: [p] }), CheckInputError);
  assert.equal(p.calls(), 0);
});

test("Shortlist: ungültige Optionen brechen ab, bevor eine Quelle abgefragt wird", async () => {
  const p = fake("p", "not_found");
  await assert.rejects(checkNames(["gut"], { registry: [p], sources: ["gibtsnicht"] }), CheckInputError);
  assert.equal(p.calls(), 0);
});

test("Shortlist: alle Namen teilen sich die Slot-Grenze je Host", async () => {
  let active = 0;
  let peak = 0;
  const fetchImpl = (async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 15));
    active--;
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
  const src: Source = {
    id: "h",
    namespace: "packages",
    label: "h",
    defaultEnabled: true,
    description: "",
    endpoint: "",
    async check(name, ctx) {
      const res = await ctx.http.request(`https://shared-owner.test/${name}`);
      return { sourceId: "h", namespace: "packages", label: "h", target: name, status: res.status === 404 ? "not_found" : "unknown" };
    },
  };
  const names = Array.from({ length: 8 }, (_, i) => `owner${i}x`);
  const { reports } = await checkNames(names, { registry: [src], fetchImpl });
  assert.ok(reports.every((r) => r.verdict === "green"));
  assert.ok(peak <= 3, `peak ${peak}`);
});

test("unknown mit vorübergehendem Grund ist retryable, dauerhafte Fehler nicht", async () => {
  clearResultCache();
  const mk = (id: string, evidence: string): Source => ({
    id, namespace: "packages", label: id, defaultEnabled: true, description: "", endpoint: "",
    async check(name) {
      return { sourceId: id, namespace: "packages", label: id, target: name, status: "unknown", evidence };
    },
  });
  const reg = [
    mk("budget", "budget"), mk("timeout", "timeout"), mk("deadline", "deadline"), mk("limit", "HTTP 429"),
    mk("limit2", "HTTP 429, error"), mk("domain", "RDAP HTTP 429; DNS: NXDOMAIN"),
    mk("net", "network"), mk("server", "HTTP 503"), mk("format", "HTTP 200, parse"), mk("leer", ""),
  ];
  const r = await checkName("retrytest", { registry: reg });
  const by = Object.fromEntries(r.results.map((x) => [x.sourceId, x.retryable === true]));
  assert.deepEqual(by, {
    budget: true, timeout: true, deadline: true, limit: true, limit2: true, domain: true,
    net: false, server: false, format: false, leer: false,
  });
});

test("eindeutige Ergebnisse sind nie retryable", async () => {
  clearResultCache();
  const s: Source = {
    id: "ok", namespace: "packages", label: "ok", defaultEnabled: true, description: "", endpoint: "",
    async check(name) {
      return { sourceId: "ok", namespace: "packages", label: "ok", target: name, status: "not_found", evidence: "budget timeout" };
    },
  };
  const r = await checkName("retrytest2", { registry: [s] });
  assert.equal(r.results[0].retryable, undefined);
});

test("das stundenlange GitHub-Rate-Limit ist nicht retryable, ein kurzes Abfragebudget schon", async () => {
  const { isTransient } = await import("@/lib/engine/check");
  assert.equal(isTransient("Rate-Limit, gesperrt bis 2026-11-04T14:17:00.000Z"), false);
  assert.equal(isTransient("gesperrt bis 2026-11-04T14:17:00.000Z"), false);
  assert.equal(isTransient("budget"), true);
});
