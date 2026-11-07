import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { POST as checkPOST } from "@/app/api/check/route";
import { POST as mcpPOST } from "@/app/api/mcp/route";
import { clearAllCaches } from "@/lib/cache";
import { clearResultCache } from "@/lib/engine/check";
import { createGuardDetailed, createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const realFetch = globalThis.fetch;
before(() => {
  clearAllCaches();
  clearResultCache();
  globalThis.fetch = (() => Promise.reject(new Error("offline"))) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  clearAllCaches();
  clearResultCache();
});

test("Limiter meldet Limit, Rest und Sekunden bis zum Ende des Fensters", () => {
  let t = 1_000_000;
  const rl = createRateLimiter({ limit: 10, windowMs: 60_000, now: () => t });
  const a = rl.check("k", 3);
  assert.deepEqual([a.allowed, a.limit, a.remaining, a.resetSec], [true, 10, 7, 60]);
  t += 20_000;
  const b = rl.check("k", 7);
  assert.deepEqual([b.allowed, b.remaining, b.resetSec], [true, 0, 40]);
  const c = rl.check("k", 1);
  assert.deepEqual([c.allowed, c.remaining, c.retryAfterSec, c.resetSec], [false, 0, 40, 40]);
  assert.deepEqual(rateLimitHeaders(c), { "RateLimit-Limit": "10", "RateLimit-Remaining": "0", "RateLimit-Reset": "40" });
});

test("Wächter: 429 trägt Retry-After und die RateLimit-Header", () => {
  const g = createGuardDetailed(createRateLimiter({ limit: 1, windowMs: 60_000 }));
  const req = () => new Request("http://localhost/x", { headers: { "x-forwarded-for": "198.51.100.1" } });
  const first = g(req());
  assert.equal(first.response, null);
  assert.equal(first.headers["RateLimit-Remaining"], "0");
  const second = g(req());
  assert.equal(second.response?.status, 429);
  assert.equal(second.response?.headers.get("ratelimit-limit"), "1");
  assert.equal(second.response?.headers.get("ratelimit-remaining"), "0");
  assert.ok(Number(second.response?.headers.get("retry-after")) >= 1);
});

function check(ip: string, names: string[]) {
  return checkPOST(
    new Request("http://localhost/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ names, namespaces: ["known_names"], sources: ["known_brands"] }),
    }),
  );
}

test("POST /api/check: Erfolgsantwort enthält die RateLimit-Header und der Rest sinkt mit der Zahl der Namen", async () => {
  const one = await check("198.51.100.20", ["wachwerk"]);
  assert.equal(one.status, 200);
  const limit = Number(one.headers.get("ratelimit-limit"));
  assert.ok(limit > 0);
  const remaining1 = Number(one.headers.get("ratelimit-remaining"));
  assert.equal(remaining1, limit - 1);
  assert.ok(Number(one.headers.get("ratelimit-reset")) >= 1);
  const three = await check("198.51.100.20", ["schichtflux", "planzeit", "klarwerk"]);
  assert.equal(Number(three.headers.get("ratelimit-remaining")), remaining1 - 3);
  assert.equal(three.headers.get("cache-control"), "no-store");
});

test("POST /api/check: 429 enthält ebenfalls die Header; der Rest ist kleiner als der Bedarf der abgelehnten Anfrage", async () => {
  const limit = Number((await check("198.51.100.30", ["wachwerk"])).headers.get("ratelimit-limit"));
  // Auffüllen über Shortlists von 10 Namen
  const names = Array.from({ length: 10 }, (_, i) => `name${String.fromCharCode(97 + i)}x`);
  let res = await check("198.51.100.30", names);
  for (let i = 0; i < Math.ceil(limit / 10) + 1 && res.status === 200; i++) res = await check("198.51.100.30", names);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("ratelimit-limit"), String(limit));
  assert.ok(Number(res.headers.get("ratelimit-remaining")) < names.length, "weniger frei, als die Anfrage braucht");
  assert.ok(res.headers.get("retry-after"));
});

test("POST /api/mcp: Antwort enthält die RateLimit-Header", async () => {
  const res = await mcpPOST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "x-forwarded-for": "198.51.100.40" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
  assert.equal(res.status, 200);
  assert.ok(Number(res.headers.get("ratelimit-limit")) > 0);
  assert.ok(res.headers.get("ratelimit-remaining") !== null);
  const body = (await res.json()) as { result?: { tools?: unknown[] } };
  assert.ok((body.result?.tools?.length ?? 0) >= 4);
});

test("Schlüssel local: keine RateLimit-Header (gemeinsamer Zähler), das Limit wirkt trotzdem", () => {
  const g = createGuardDetailed(createRateLimiter({ limit: 1, windowMs: 60_000 }));
  // Ohne x-forwarded-for und x-real-ip fällt der Schlüssel auf "local"
  const anonymous = () => new Request("http://localhost/x");
  const first = g(anonymous());
  assert.equal(first.response, null);
  assert.deepEqual(first.headers, {});
  const second = g(anonymous());
  assert.equal(second.response?.status, 429);
  assert.ok(Number(second.response?.headers.get("retry-after")) >= 1);
  for (const name of ["ratelimit-limit", "ratelimit-remaining", "ratelimit-reset"]) {
    assert.equal(second.response?.headers.get(name), null, name);
  }
});

test("POST /api/check: Fehler nach dem Guard (400 aus der Engine) tragen die RateLimit-Header", async () => {
  // Ein ungültiger Name scheitert erst in der Engine; die Kosten sind bereits verbraucht.
  const res = await check("198.51.100.50", ["!!"]);
  assert.equal(res.status, 400);
  assert.ok(Number(res.headers.get("ratelimit-limit")) > 0);
  assert.ok(res.headers.get("ratelimit-remaining") !== null);
  assert.ok(Number(res.headers.get("ratelimit-reset")) >= 1);
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("POST /api/mcp: Batch-Ablehnung (400) trägt die RateLimit-Header", async () => {
  const res = await mcpPOST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "x-forwarded-for": "198.51.100.60" },
      body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]),
    }),
  );
  assert.equal(res.status, 400);
  assert.ok(Number(res.headers.get("ratelimit-limit")) > 0);
  assert.ok(res.headers.get("ratelimit-remaining") !== null);
});
