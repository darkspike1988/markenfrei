import { test } from "node:test";
import assert from "node:assert/strict";
import { clientKey, createGuard, createRateLimiter } from "@/lib/rate-limit";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("erlaubt bis zum Limit und lehnt danach ab", () => {
  const c = clock();
  const rl = createRateLimiter({ limit: 2, windowMs: 60_000, now: c.now });
  assert.equal(rl.check("a").allowed, true);
  assert.equal(rl.check("a").allowed, true);
  const third = rl.check("a");
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSec >= 1);
});

test("nach Ablauf des Fensters ist wieder alles erlaubt", () => {
  const c = clock();
  const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: c.now });
  rl.check("a");
  assert.equal(rl.check("a").allowed, false);
  c.advance(60_001);
  assert.equal(rl.check("a").allowed, true);
});

test("Schlüssel zählen getrennt", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now });
  assert.equal(rl.check("a").allowed, true);
  assert.equal(rl.check("b").allowed, true);
  assert.equal(rl.check("a").allowed, false);
});

test("clientKey nimmt die erste Adresse aus x-forwarded-for", () => {
  const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
  assert.equal(clientKey(req), "1.2.3.4");
  assert.equal(clientKey(new Request("http://x")), "local");
});

test("Wächter antwortet mit 429, Retry-After und deutschem Text", async () => {
  const guard = createGuard(createRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now }));
  const req = () => new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9" } });
  assert.equal(guard(req()), null);
  const res = guard(req());
  assert.ok(res);
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get("Retry-After")) >= 1);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /Zu viele Anfragen/);
});
