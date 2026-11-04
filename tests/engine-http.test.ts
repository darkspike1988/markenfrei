import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUserAgent, createHttpClient } from "@/lib/engine/http";

const far = () => Date.now() + 60_000;

test("liest JSON und setzt den User-Agent", async () => {
  let ua = "";
  const http = createHttpClient({
    deadlineAt: far(),
    userAgent: buildUserAgent("mailto:a@b.c"),
    fetchImpl: (async (_u: string, init?: RequestInit) => {
      ua = (init?.headers as Record<string, string>)["User-Agent"];
      return Response.json({ ok: 1 });
    }) as unknown as typeof fetch,
  });
  const r = await http.request("https://x.test/a", { read: "json" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: 1 });
  assert.equal(ua, "Markenfrei/2.0 (+https://markenfrei.app; mailto:a@b.c)");
});

test("ohne Kontakt kein leerer Zusatz im User-Agent", () => {
  assert.equal(buildUserAgent(""), "Markenfrei/2.0 (+https://markenfrei.app)");
});

test("gleiche gleichzeitige Anfragen werden gebündelt", async () => {
  let calls = 0;
  const http = createHttpClient({
    deadlineAt: far(),
    userAgent: "t",
    fetchImpl: (async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch,
  });
  const [a, b] = await Promise.all([http.request("https://x.test/b"), http.request("https://x.test/b")]);
  assert.equal(calls, 1);
  assert.equal(a.status, 404);
  assert.equal(b.status, 404);
});

test("höchstens vier gleichzeitige Anfragen pro Host", async () => {
  let active = 0;
  let peak = 0;
  const http = createHttpClient({
    deadlineAt: far(),
    userAgent: "t",
    fetchImpl: (async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch,
  });
  await Promise.all(Array.from({ length: 10 }, (_, i) => http.request(`https://h.test/${i}`)));
  assert.ok(peak <= 4, `peak ${peak}`);
});

test("abgelaufene Deadline startet keine Anfrage", async () => {
  let calls = 0;
  const http = createHttpClient({
    deadlineAt: Date.now() - 1,
    userAgent: "t",
    fetchImpl: (async () => (calls++, new Response(null))) as unknown as typeof fetch,
  });
  const r = await http.request("https://x.test/c");
  assert.equal(r.error, "deadline");
  assert.equal(calls, 0);
});

test("Netzfehler und Timeout werden als Fehler gemeldet, nicht geworfen", async () => {
  const failing = createHttpClient({
    deadlineAt: far(),
    userAgent: "t",
    fetchImpl: (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch,
  });
  assert.equal((await failing.request("https://x.test/d")).error, "network");

  const slow = createHttpClient({
    deadlineAt: far(),
    userAgent: "t",
    fetchImpl: ((_u: string, init?: RequestInit) =>
      new Promise((_r, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("t"), { name: "TimeoutError" })));
      })) as unknown as typeof fetch,
  });
  assert.equal((await slow.request("https://x.test/e", { timeoutMs: 20 })).error, "timeout");
});

test("zu große Antworten werden abgebrochen", async () => {
  const http = createHttpClient({
    deadlineAt: far(),
    userAgent: "t",
    fetchImpl: (async () => new Response("x".repeat(2000))) as unknown as typeof fetch,
  });
  const r = await http.request("https://x.test/f", { read: "text", maxBytes: 100 });
  assert.equal(r.error, "too_large");
});

test("ungültiges JSON ergibt parse-Fehler mit Text", async () => {
  const http = createHttpClient({
    deadlineAt: far(),
    userAgent: "t",
    fetchImpl: (async () => new Response("<html>")) as unknown as typeof fetch,
  });
  const r = await http.request("https://x.test/g", { read: "json" });
  assert.equal(r.error, "parse");
  assert.equal(r.text, "<html>");
});
