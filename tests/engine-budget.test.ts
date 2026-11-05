import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { HOST_BUDGETS, createHttpClient, githubBudget, huggingfaceBudget, resetHostBudgets, takeBudget } from "@/lib/engine/http";
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

test("takeBudget: erschöpftes Budget reserviert künftige Zeitpunkte, Wartende reihen sich hintereinander ein", () => {
  const b = { max: 1, windowMs: 1000 };
  assert.equal(takeBudget("q.test", b, 0, 1500), 0);
  assert.equal(takeBudget("q.test", b, 0, 1500), 1000, "zweiter bekommt den Platz bei 1000");
  assert.equal(takeBudget("q.test", b, 0, 1500), 2000, "dritter läge bei 2000, über der erlaubten Wartezeit: nichts reserviert");
  assert.equal(takeBudget("q.test", b, 0, 2500), 2000, "mit mehr erlaubter Wartezeit wird der Platz bei 2000 reserviert");
  assert.equal(takeBudget("q.test", b, 500, 1500), 2500, "nächster Platz wäre 3000, jetzt 500: zu weit, nichts reserviert");
});

test("crates.io-Form (1 je Fenster): gleichzeitige Anfragen stehen an, solange die Gesamtwartezeit reicht, keine Wettlaufverluste", async () => {
  const { urls, fetchImpl } = counting();
  const http = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl, hostBudgets: { "crates2.test": { max: 1, windowMs: 100 } } });
  const r = await alive(() => Promise.all(Array.from({ length: 10 }, (_, i) => http.request(`https://crates2.test/${i}`))));
  assert.deepEqual(r.map((x) => x.error ?? x.status), Array(10).fill(404), "Wartezeit bis 900 ms liegt unter dem Limit, alle laufen");
  assert.equal(urls.length, 10);
});

test("crates.io-Form: Anfragen jenseits der erlaubten Wartezeit bekommen budget, ohne Budget zu verbrauchen", async () => {
  const { urls, fetchImpl } = counting();
  // Genug Slots, damit alle Anfragen gleichzeitig ihren Platz reservieren (sonst vergeht beim Warten auf Slots Zeit)
  const http = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl, perHostLimit: 10, perOwnerLimit: 10, hostBudgets: { "crates3.test": { max: 1, windowMs: 500 } } });
  const r = await alive(() => Promise.all(Array.from({ length: 10 }, (_, i) => http.request(`https://crates3.test/${i}`))));
  // Plätze bei 0, 500, 1000 und 1500 (Wartezeit höchstens 1500 ms), die übrigen scheitern sofort
  assert.deepEqual(r.slice(0, 4).map((x) => x.error ?? x.status), [404, 404, 404, 404]);
  assert.deepEqual(r.slice(4).map((x) => x.error), Array(6).fill("budget"));
  assert.equal(urls.length, 4);
});

test("Slot-Wartezeit an der Deadline verbraucht kein Budget", async () => {
  const { fetchImpl } = counting();
  const hostBudgets = { "slotbudget.test": { max: 1, windowMs: 60_000 } };
  // Ein Besitzer füllt alle Slots, der Wartende läuft in die Deadline und darf kein Budget nehmen
  const owner = {};
  const blockers = createHttpClient({
    deadlineAt: far(),
    userAgent: "t",
    perHostLimit: 1,
    hostBudgets: {},
    owner,
    fetchImpl: (() => new Promise<Response>((r) => setTimeout(() => r(new Response(null, { status: 404 })), 300))) as unknown as typeof fetch,
  });
  const hold = blockers.request("https://slotbudget.test/hold");
  const late = createHttpClient({ deadlineAt: Date.now() + 100, userAgent: "t", perHostLimit: 1, hostBudgets, fetchImpl });
  const lateRes = await alive(() => late.request("https://slotbudget.test/late"));
  assert.equal(lateRes.error, "deadline");
  await alive(() => hold);
  const ok = createHttpClient({ deadlineAt: far(), userAgent: "t", hostBudgets, fetchImpl });
  assert.equal((await ok.request("https://slotbudget.test/ok")).status, 404, "das einzige Budget war noch frei");
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
  assert.match(second.evidence ?? "", /^budget/, "Beleg erlaubt der Engine, das Ergebnis als wiederholbar zu markieren");
});

test("Hugging Face: Budget liegt unter dem anonymen Limit (500 je 5 Minuten), mit Token unter dem Free-Limit (1.000)", () => {
  const anon = huggingfaceBudget(undefined);
  assert.ok(anon.max < 500 && anon.windowMs === 300_000);
  assert.deepEqual(huggingfaceBudget("   "), anon, "leerer Token zählt als keiner");
  const withToken = huggingfaceBudget("hf_x");
  assert.ok(withToken.max < 1000 && withToken.max > anon.max && withToken.windowMs === 300_000);
  assert.ok(HOST_BUDGETS["huggingface.co"].max === anon.max || HOST_BUDGETS["huggingface.co"].max === withToken.max);
});

test("GLEIF: Budget unter der genannten Grenze von 60 pro Minute", () => {
  const g = HOST_BUDGETS["api.gleif.org"];
  assert.ok(g.max < 60 && g.windowMs === 60_000);
});

test("GLEIF: erschöpftes Budget ist unknown mit Hinweis, nie not_found", async () => {
  const { KNOWN_NAME_SOURCES } = await import("@/lib/engine/sources/known-names");
  const gleif = KNOWN_NAME_SOURCES.find((s) => s.id === "gleif")!;
  const fetchImpl = (async () => Response.json({ data: [], meta: { pagination: { total: 0 } } })) as unknown as typeof fetch;
  const http = createHttpClient({ deadlineAt: far(), userAgent: "t", fetchImpl, hostBudgets: { "api.gleif.org": { max: 1, windowMs: 60_000 } } });
  const ctx = { http, contact: "" };
  assert.equal((await gleif.check("budgetfirma", ctx)).status, "not_found");
  const second = await gleif.check("budgetfirma2", ctx);
  assert.equal(second.status, "unknown");
  assert.match(second.note ?? "", /Abfragelimit/);
  assert.match(second.evidence ?? "", /^budget/);
});

test("GitHub: Budget liegt unter 60 je Stunde ohne Token und unter 5.000 mit Token", () => {
  const anon = githubBudget(undefined);
  assert.ok(anon.max < 60 && anon.windowMs === 3_600_000);
  assert.deepEqual(githubBudget("  "), anon, "leerer Token zählt als keiner");
  const withToken = githubBudget("ghp_x");
  assert.ok(withToken.max < 5000 && withToken.max > anon.max && withToken.windowMs === 3_600_000);
  assert.ok(HOST_BUDGETS["api.github.com"].max === anon.max || HOST_BUDGETS["api.github.com"].max === withToken.max);
});
