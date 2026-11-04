import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedLookup, createTtlCache } from "@/lib/cache";

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("Wert gilt bis zum Ablauf, danach nicht mehr", () => {
  const c = clock();
  const cache = createTtlCache<string>({ ttlMs: 1000, max: 10, now: c.now });
  cache.set("a", "x");
  assert.equal(cache.get("a"), "x");
  c.advance(1001);
  assert.equal(cache.get("a"), undefined);
});

test("bei Überlauf fliegt der älteste Eintrag raus", () => {
  const cache = createTtlCache<number>({ ttlMs: 1000, max: 2, now: clock().now });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
});

test("ttl 0 speichert nichts", () => {
  const cache = createTtlCache<number>({ ttlMs: 0, max: 5 });
  cache.set("a", 1);
  assert.equal(cache.get("a"), undefined);
});

test("eindeutige Antworten werden wiederverwendet", async () => {
  const cache = createTtlCache<string>({ ttlMs: 1000, max: 5, now: clock().now });
  let calls = 0;
  const fn = async () => (++calls, "taken");
  const definitive = (v: string) => v !== "unknown";
  assert.equal(await cachedLookup(cache, "k", fn, definitive), "taken");
  assert.equal(await cachedLookup(cache, "k", fn, definitive), "taken");
  assert.equal(calls, 1);
});

test("unknown wird nie gespeichert und beim nächsten Mal neu abgefragt", async () => {
  const cache = createTtlCache<string>({ ttlMs: 1000, max: 5, now: clock().now });
  const answers = ["unknown", "available"];
  let calls = 0;
  const fn = async () => answers[calls++];
  const definitive = (v: string) => v !== "unknown";
  assert.equal(await cachedLookup(cache, "k", fn, definitive), "unknown");
  assert.equal(await cachedLookup(cache, "k", fn, definitive), "available");
  assert.equal(await cachedLookup(cache, "k", fn, definitive), "available");
  assert.equal(calls, 2);
});
