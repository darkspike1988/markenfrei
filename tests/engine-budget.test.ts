import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { HOST_BUDGETS, createHttpClient, resetHostBudgets, takeBudget } from "@/lib/engine/http";
import { STORE_SOURCES } from "@/lib/engine/sources/stores-social";

beforeEach(() => resetHostBudgets());

const far = () => Date.now() + 60_000;

/** Hält die Event-Loop am Leben, solange auf entkoppelte Timer gewartet wird (siehe engine-http.test.ts). */
async function alive<T>(fn: () => Promise<T>): Promise<T> {
  const keep = setTimeout(() => undefined, 5_000);
  try {
    return await fn();
  } finally {
    clearTimeout(keep);
  }
}

function counting(status = 404) {
  const urls: string[] = [];
  const fetchImpl = (async (u: string) => (urls.push(u), new Response(null, { status }))) as unknown as typeof fetch;
  return { urls, fetchImpl };
}

test("dokumentierte Grenzen: Apple höchstens 20 pro Minute, crates.io höchstens 1 pro Sekunde", () => {
  const apple = HOST_BUDGETS["itunes.apple.com"];
  assert.ok(apple.max <= 20 && apple.windowMs === 60_000);
  const crates = HOST_BUDGETS["crates.io"];
  assert.ok(crates.max / (crates.windowMs / 1000) <= 1);
  assert.ok(HOST_BUDGETS["hex.pm"].max <= 100 && HOST_BUDGETS["mastodon.social"].max <= 300);
});

test("takeBudget: bis zum Limit frei, danach Wartezeit bis zum ältesten Eintrag, nach dem Fenster wieder frei", () => {
  const b = { max: 2, windowMs: 1000 };
  assert.equal(takeBudget("t.test", b, 0), 0);
  assert.equal(takeBudget("t.test", b, 100), 0);
  assert.equal(takeBudget("t.test", b, 200), 800, "ältester Eintrag bei 0, Fenster endet bei 1000, jetzt 200");
  assert.equal(takeBudget("t.test", b, 200), 800, "der Versuch verbraucht nichts");
  assert.equal(takeBudget("t.test", b, 1001), 0, "erster Eintrag ist abgelaufen");
});

test("erschöpftes Budget: keine Anfrage wird gesendet, Ergebnis ist error budget", async () => {
  const { urls, fetchImpl } = counting();
  const http = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl, hostBudgets: { "budget1.test": { max: 2, windowMs: 60_000 } } });
  const r = await Promise.all([1, 2, 3, 4].map((i) => http.request(`https://budget1.test/${i}`)));
  assert.deepEqual(r.map((x) => x.error ?? x.status), [404, 404, "budget", "budget"]);
  assert.equal(urls.length, 2, "nur zwei Anfragen erreichen den Dienst");
});

test("kurze Wartezeit: die Anfrage wartet auf das nächste freie Budget und läuft dann", async () => {
  const { urls, fetchImpl } = counting();
  const http = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl, hostBudgets: { "budget2.test": { max: 1, windowMs: 300 } } });
  const t0 = Date.now();
  const [a, b] = await alive(() => Promise.all([http.request("https://budget2.test/a"), http.request("https://budget2.test/b")]));
  assert.equal(a.status, 404);
  assert.equal(b.status, 404, "zweite Anfrage wartete und ging dann durch");
  assert.ok(Date.now() - t0 >= 250, "es wurde gewartet");
  assert.equal(urls.length, 2);
});

test("zu lange Wartezeit oder knappe Deadline: sofort budget, kein Warten", async () => {
  const { fetchImpl } = counting();
  const slow = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl, hostBudgets: { "budget3.test": { max: 1, windowMs: 60_000 } } });
  await slow.request("https://budget3.test/a");
  const t0 = Date.now();
  const r = await slow.request("https://budget3.test/b");
  assert.equal(r.error, "budget");
  assert.ok(Date.now() - t0 < 300, "nicht gewartet");

  const tight = createHttpClient({ deadlineAt: Date.now() + 1200, userAgent: "t", fetchImpl, hostBudgets: { "budget4.test": { max: 1, windowMs: 800 } } });
  await tight.request("https://budget4.test/a");
  assert.equal((await tight.request("https://budget4.test/b")).error, "budget", "Warten würde die Deadline auffressen");
});

test("Hosts ohne Budget sind unbeeinflusst, und Budgets sind je Host getrennt", async () => {
  const { urls, fetchImpl } = counting();
  const http = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl, hostBudgets: { "only.test": { max: 1, windowMs: 60_000 } } });
  const r = await Promise.all([http.request("https://free.test/1"), http.request("https://free.test/2"), http.request("https://free.test/3"), http.request("https://only.test/1")]);
  assert.ok(r.every((x) => x.status === 404));
  assert.equal(urls.length, 4);
});

test("App Store: erschöpftes Apple-Budget ist unknown mit Hinweis, nie frei", async () => {
  const appstore = STORE_SOURCES.find((s) => s.id === "appstore")!;
  const fetchImpl = (async () => Response.json({ resultCount: 0, results: [] })) as unknown as typeof fetch;
  const http = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl, hostBudgets: { "itunes.apple.com": { max: 1, windowMs: 60_000 } } });
  const ctx = { http, contact: "" };
  const first = await appstore.check("budgetname", ctx);
  assert.equal(first.status, "not_found");
  const second = await appstore.check("budgetname2", ctx);
  assert.equal(second.status, "unknown");
  assert.match(second.note ?? "", /Abfragelimit/);
});
