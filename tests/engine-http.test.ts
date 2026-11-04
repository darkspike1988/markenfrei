import { test } from "node:test";
import assert from "node:assert/strict";
import { acquireSlot, buildUserAgent, createHttpClient, queuedForHost } from "@/lib/engine/http";

const far = () => Date.now() + 60_000;

/**
 * Die Timer des Clients (AbortSignal.timeout, Warteschlange) halten die Event-Loop absichtlich
 * nicht am Leben. Im Betrieb trägt der Server die Loop; hier tut es dieser Timer, sonst beendet
 * Node den Testprozess, bevor ein Fake-fetch abgebrochen wird ("Promise resolution is still
 * pending but the event loop has already resolved", gesehen unter Node 22).
 */
async function withLoopAlive<T>(fn: () => Promise<T>, ms = 5_000): Promise<T> {
  const keep = setTimeout(() => undefined, ms);
  try {
    return await fn();
  } finally {
    clearTimeout(keep);
  }
}

/** Fake-fetch, der erst beim Abbruch über das Signal scheitert. */
const abortOnlyFetch = ((_u: string, init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(init.signal!.reason ?? Object.assign(new Error("t"), { name: "TimeoutError" })),
    );
  })) as unknown as typeof fetch;

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

  const slow = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl: abortOnlyFetch });
  const r = await withLoopAlive(() => slow.request("https://x.test/e", { timeoutMs: 20 }));
  assert.equal(r.error, "timeout");
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

test("eine einzelne Prüfung belegt höchstens drei der vier Slots je Host", async () => {
  let active = 0;
  let peak = 0;
  const http = createHttpClient({
    deadlineAt: far(),
    userAgent: "t",
    fetchImpl: (async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch,
  });
  await Promise.all(Array.from({ length: 12 }, (_, i) => http.request(`https://cap.test/${i}`)));
  assert.equal(peak, 3);
});

test("eine kleine Prüfung wartet nicht hinter der Warteschlange einer großen", async () => {
  const started: string[] = [];
  const pending: (() => void)[] = [];
  const slowFetch = (async (u: string) => {
    started.push(new URL(u).pathname);
    await new Promise<void>((r) => pending.push(r));
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
  const big = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl: slowFetch });
  const small = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl: slowFetch });

  const bigAll = Promise.all(Array.from({ length: 20 }, (_, i) => big.request(`https://fair.test/a${i}`)));
  await new Promise((r) => setTimeout(r, 5));
  const smallOne = small.request("https://fair.test/b0");
  await new Promise((r) => setTimeout(r, 5));
  // Ohne Fairness stünde b0 hinter 17 wartenden Anfragen von "big"
  assert.ok(started.includes("/b0"), `gestartet: ${started.join(",")}`);

  // Neue Slots gehen an den Besitzer mit den wenigsten aktiven Slots
  const smallTwo = small.request("https://fair.test/b1");
  const smallThree = small.request("https://fair.test/b2");
  pending.shift()!();
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(started.includes("/b1"), `gestartet: ${started.join(",")}`);

  const drain = setInterval(() => pending.splice(0).forEach((r) => r()), 1);
  const [s1, s2, s3] = await Promise.all([smallOne, smallTwo, smallThree]);
  await bigAll;
  clearInterval(drain);
  assert.equal(s1.status, 404);
  assert.equal(s2.status, 404);
  assert.equal(s3.status, 404);
});

test("Wartende geben an ihrer Deadline auf und verlassen die Schlange", async () => {
  const hold: (() => void)[] = [];
  const owner = {};
  for (let i = 0; i < 4; i++) {
    const rel = await acquireSlot("wait.test", { i }, { deadlineAt: far() });
    assert.ok(rel);
    hold.push(rel);
  }
  const t0 = Date.now();
  const r = await withLoopAlive(() => acquireSlot("wait.test", owner, { deadlineAt: Date.now() + 40 }));
  assert.equal(r, null);
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(queuedForHost("wait.test"), 0);
  hold.forEach((rel) => rel());

  const http = createHttpClient({
    deadlineAt: Date.now() + 40,
    userAgent: "t",
    perOwnerLimit: 1,
    fetchImpl: abortOnlyFetch,
  });
  const [first, second] = await withLoopAlive(() =>
    Promise.all([http.request("https://wait2.test/1"), http.request("https://wait2.test/2")]),
  );
  assert.equal(first.error, "deadline");
  assert.equal(second.error, "deadline", "wartet nicht bis zum Slot, sondern gibt an der Deadline auf");
  assert.equal(queuedForHost("wait2.test"), 0);
});

test("retry: ein Timeout wird einmal wiederholt, ohne retry nicht", async () => {
  let calls = 0;
  const flaky = (async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error("t"), { name: "TimeoutError" });
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
  const withRetry = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl: flaky });
  const r = await withLoopAlive(() => withRetry.request("https://retry.test/a", { retry: true }));
  assert.equal(r.status, 404);
  assert.equal(calls, 2);

  calls = 0;
  const noRetry = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl: flaky });
  const r2 = await noRetry.request("https://retry.test/b");
  assert.equal(r2.error, "timeout");
  assert.equal(calls, 1);
});

test("retry: 429 wird einmal wiederholt, 404 nie, und nur wenn die Deadline Luft lässt", async () => {
  const statuses = [429, 200];
  let calls = 0;
  const f = (async () => new Response(null, { status: statuses[calls++] ?? 200 })) as unknown as typeof fetch;
  const http = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl: f });
  const r = await withLoopAlive(() => http.request("https://retry.test/c", { retry: true }));
  assert.equal(r.status, 200);
  assert.equal(calls, 2);

  let n404 = 0;
  const h = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl: (async () => (n404++, new Response(null, { status: 404 }))) as unknown as typeof fetch });
  await h.request("https://retry.test/d", { retry: true });
  assert.equal(n404, 1);

  let late = 0;
  const l = createHttpClient({ deadlineAt: Date.now() + 500, userAgent: "t", fetchImpl: (async () => (late++, new Response(null, { status: 503 }))) as unknown as typeof fetch });
  const lr = await withLoopAlive(() => l.request("https://retry.test/e", { retry: true }));
  assert.equal(lr.status, 503);
  assert.equal(late, 1, "bei knapper Deadline keine Wiederholung");
});
