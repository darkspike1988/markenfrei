import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKAGE_SOURCES, cratesIndexPath } from "@/lib/engine/sources/packages";
import { checkNames, clearResultCache, isTransient } from "@/lib/engine/check";
import { createHttpClient } from "@/lib/engine/http";
import type { CheckContext, HttpClient, HttpResponse, Source } from "@/lib/engine/types";

type Reply = { status: number; error?: HttpResponse["error"] };

function stub(routes: Record<string, Reply>) {
  const calls: { url: string; redirect?: string }[] = [];
  const http: HttpClient = {
    async request(url, req = {}) {
      calls.push({ url, redirect: req.redirect });
      const r = routes[url];
      if (!r) throw new Error(`unerwartete URL im Test: ${url}`);
      return { status: r.status, headers: new Headers(), error: r.error };
    },
  };
  const ctx: CheckContext = { http, contact: "" };
  return { ctx, calls };
}

const crates = PACKAGE_SOURCES.find((s) => s.id === "crates") as Source;
const IDX = "https://index.crates.io/";

test("cratesIndexPath: Pfade nach Namenslänge", () => {
  assert.equal(cratesIndexPath("a-b"), "3/a/a-b");
  assert.equal(cratesIndexPath("ab"), "2/ab");
  assert.equal(cratesIndexPath("a"), "1/a");
  assert.equal(cratesIndexPath("serde"), "se/rd/serde");
});

test("crates: 3xx vom Index => unknown, nie taken oder not_found", async () => {
  const { ctx, calls } = stub({ [`${IDX}se/rd/serde-json`]: { status: 404 }, [`${IDX}se/rd/serde_json`]: { status: 301 } });
  const r = await crates.check("serde-json", ctx);
  assert.equal(r.status, "unknown");
  assert.ok(calls.every((c) => c.redirect === "manual"), "Index-Anfragen mit redirect: manual");
});

test("crates: 3xx als einzige Antwort => unknown", async () => {
  const { ctx } = stub({ [`${IDX}wa/ch/wachwerk`]: { status: 302 } });
  assert.equal((await crates.check("wachwerk", ctx)).status, "unknown");
});

test("http: redirect manual wird an fetch durchgereicht, Standard bleibt follow", async () => {
  const seen: (RequestRedirect | undefined)[] = [];
  const fetchImpl: typeof fetch = async (_u, init) => {
    seen.push(init?.redirect);
    return new Response(null, { status: 301, headers: { location: "https://example.org/" } });
  };
  const c = createHttpClient({ deadlineAt: Date.now() + 5000, userAgent: "t", fetchImpl, hostBudgets: {} });
  const m = await c.request("https://example.test/a", { redirect: "manual" });
  await c.request("https://example.test/b");
  assert.equal(m.status, 301);
  assert.deepEqual(seen, ["manual", "follow"]);
});

test("crates: gemischte Fehler (503 + Timeout) => retryable, egal in welcher Reihenfolge", async () => {
  for (const [a, b] of [
    [{ status: 503 }, { status: 0, error: "timeout" }],
    [{ status: 0, error: "timeout" }, { status: 503 }],
  ] as Reply[][]) {
    const { ctx } = stub({ [`${IDX}se/rd/serde-json`]: a, [`${IDX}se/rd/serde_json`]: b });
    const r = await crates.check("serde-json", ctx);
    assert.equal(r.status, "unknown");
    assert.ok(isTransient(r.evidence), `evidence: ${r.evidence}`);
  }
});

test("crates: a-b-c: drei 404 und ein Timeout => unknown, retryable, nie not_found", async () => {
  const { ctx, calls } = stub({
    [`${IDX}a-/b-/a-b-c`]: { status: 404 },
    [`${IDX}a-/b_/a-b_c`]: { status: 404 },
    [`${IDX}a_/b-/a_b-c`]: { status: 0, error: "timeout" },
    [`${IDX}a_/b_/a_b_c`]: { status: 404 },
  });
  const r = await crates.check("a-b-c", ctx);
  assert.equal(calls.length, 4);
  assert.equal(r.status, "unknown");
  assert.ok(isTransient(r.evidence));
});

test("crates: ab-cd: Pfad wird je Variante gebildet", async () => {
  const { ctx, calls } = stub({
    [`${IDX}ab/-c/ab-cd`]: { status: 404 },
    [`${IDX}ab/_c/ab_cd`]: { status: 200 },
  });
  const r = await crates.check("ab-cd", ctx);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://crates.io/crates/ab_cd");
  assert.deepEqual(calls.map((c) => c.url).sort(), [`${IDX}ab/-c/ab-cd`, `${IDX}ab/_c/ab_cd`]);
});

test("crates: a-b: 403 oder 429 bei einer Variante, 404 bei der anderen => unknown (429 retryable)", async () => {
  for (const [status, transient] of [[403, false], [429, true]] as const) {
    const { ctx } = stub({ [`${IDX}3/a/a-b`]: { status: 404 }, [`${IDX}3/a/a_b`]: { status } });
    const r = await crates.check("a-b", ctx);
    assert.equal(r.status, "unknown", `HTTP ${status}`);
    assert.equal(isTransient(r.evidence), transient, `HTTP ${status}: ${r.evidence}`);
  }
});

test("crates: mehr als zwei Bindestriche => Rückfall auf die API-URL", async () => {
  const api = "https://crates.io/api/v1/crates/a-b-c-d";
  const { ctx, calls } = stub({ [api]: { status: 404 } });
  const r = await crates.check("a-b-c-d", ctx);
  assert.equal(r.status, "not_found");
  assert.deepEqual(calls.map((c) => c.url), [api]);
});

test("crates: Katalog nennt Pfadschema und API-Rückfall", () => {
  assert.match(crates.endpoint, /\{Pfad\}/);
  assert.match(crates.endpoint, /crates\.io\/api\/v1\/crates\/\{name\}/);
});

test("Shortlist: 10 Namen mit je zwei Bindestrichen (40 Anfragen) => alle not_found, kein budget/deadline", async () => {
  clearResultCache();
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    calls.push(String(input));
    return new Response("{}", { status: 404 });
  };
  const names = Array.from({ length: 10 }, (_, i) => `wx-${"abcdefghij"[i]}y-zq${i}`);
  const { reports } = await checkNames(names, { fetchImpl, namespaces: ["packages"] });
  for (const r of reports) {
    const c = r.results.find((x) => x.sourceId === "crates");
    assert.equal(c?.status, "not_found", `${r.name}: ${c?.evidence}`);
    assert.ok(!/budget|deadline/.test(c?.evidence ?? ""));
  }
  assert.equal(calls.filter((u) => u.startsWith("https://index.crates.io/")).length, 40);
  assert.ok(!calls.some((u) => u.startsWith("https://crates.io/api/")));
});
