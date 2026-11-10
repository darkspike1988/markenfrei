import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { clearAllCaches } from "@/lib/cache";
import { clearResultCache, resolveSources } from "@/lib/engine/check";
import { selectSources } from "@/lib/engine/format";
import { POST } from "@/app/api/check/route";
import type { SourceResult } from "@/lib/engine/types";
import { rankReports, type ShortlistEntry } from "@/lib/engine/verdict";
import { shortlistCount, shortlistSummary } from "@/components/verdict-text";

const realFetch = globalThis.fetch;
before(() => {
  clearAllCaches();
  clearResultCache();
  // Alle Quellen offline: geprüft werden Eingabe, Antwortform und Fehlerbehandlung.
  globalThis.fetch = (() => Promise.reject(new Error("offline"))) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  clearAllCaches();
  clearResultCache();
});

let ipCounter = 10;
function call(body: unknown, opts: { raw?: boolean; ip?: string; next?: boolean } = {}) {
  const ip = opts.ip ?? `198.51.100.${ipCounter++}`;
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: opts.raw ? String(body) : JSON.stringify(body),
  };
  const url = "http://localhost/api/check";
  return POST(opts.next ? new NextRequest(url, init) : new Request(url, init));
}

type Ok = {
  ranking: { name: string; verdict: string; freeInAll: boolean }[];
  reports: { name: string; verdict: string; results: { status: string }[]; trademark: { status: string } }[];
};

test("ein Name liefert Rangliste und Bericht", async () => {
  const res = await call({ names: ["Wachwerk"], namespaces: ["packages"] });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = (await res.json()) as Ok;
  assert.equal(body.reports.length, 1);
  assert.equal(body.reports[0].name, "wachwerk");
  assert.equal(body.reports[0].trademark.status, "not_checked");
  // offline: keine Quelle antwortet, also nie grün
  assert.notEqual(body.reports[0].verdict, "green");
  assert.ok(body.reports[0].results.every((r) => r.status === "unknown"));
  assert.equal(body.ranking[0].name, "wachwerk");
});

test("funktioniert auch mit NextRequest", async () => {
  const res = await call({ names: ["alpha", "beta"], namespaces: ["packages"], tlds: ["de"] }, { next: true });
  assert.equal(res.status, 200);
  const body = (await res.json()) as Ok;
  assert.equal(body.reports.length, 2);
  assert.deepEqual(body.ranking.map((r) => r.name).sort(), ["alpha", "beta"]);
});

test("Endungen und ausdrückliche Quellen werden übernommen", async () => {
  const res = await call({ names: ["wachwerk"], tlds: ["de", "com"], sources: ["nuget"], namespaces: ["domains"] });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { reports: { results: { sourceId: string }[] }[] };
  assert.deepEqual(body.reports[0].results.map((r) => r.sourceId), ["rdap:de", "rdap:com", "nuget"]);
});

test("profile wählt Namensräume, Quellen und Endungen; ausdrückliche Felder ersetzen ihren Teil", async () => {
  const res = await call({ names: ["wachwerk"], profile: "python" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { reports: { results: { sourceId: string }[] }[] };
  const expected = resolveSources(selectSources({ profile: "python" }, false)).map((s) => s.id);
  assert.deepEqual(body.reports[0].results.map((r) => r.sourceId), expected);
  assert.ok(expected.includes("pypi") && !expected.some((id) => id.startsWith("rdap:")));

  const withTlds = await call({ names: ["wachwerk"], profile: "python", tlds: ["de"], sources: ["pypi"] });
  assert.equal(withTlds.status, 200);
  const other = (await withTlds.json()) as { reports: { results: { sourceId: string }[] }[] };
  assert.deepEqual(other.reports[0].results.map((r) => r.sourceId), ["rdap:de", "pypi"]);
});

test("unbekanntes oder falsches profile ergibt 400 mit der Liste der Profile", async () => {
  const unknown = await call({ names: ["wachwerk"], profile: "gibtsnicht" });
  assert.equal(unknown.status, 400);
  assert.match(((await unknown.json()) as { error: string }).error, /^Unbekanntes Profil „gibtsnicht“\. Erlaubt: allgemein, web-app, /);

  const long = await call({ names: ["wachwerk"], profile: "x".repeat(41) });
  assert.equal(long.status, 400);
  assert.match(((await long.json()) as { error: string }).error, /^Unbekanntes Profil\. Erlaubt: /);

  const wrongType = await call({ names: ["wachwerk"], profile: ["npm"] });
  assert.equal(wrongType.status, 400);
  assert.equal(((await wrongType.json()) as { error: string }).error, "profile muss ein Text sein.");
});

test("falscher Typ für names ergibt 400 mit deutscher Meldung", async () => {
  const res = await call({ names: "wachwerk" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /Liste/);
});

test("fehlende oder leere names ergeben 400", async () => {
  for (const b of [{}, { names: [] }]) {
    const res = await call(b);
    assert.equal(res.status, 400);
  }
  const res = await call({ names: [] });
  assert.match(((await res.json()) as { error: string }).error, /mindestens einen Namen/);
});

test("zu viele Namen ergeben 400", async () => {
  const names = Array.from({ length: 11 }, (_, i) => `name${i}`);
  const res = await call({ names });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /Höchstens 10 Namen/);
});

test("unbekannte Endung (CheckInputError) ergibt 400 mit Meldung der Engine", async () => {
  const res = await call({ names: ["wachwerk"], tlds: ["zz"] });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /Endung „zz“ wird nicht unterstützt/);
});

test("unbekannter Namensraum ergibt 400", async () => {
  const res = await call({ names: ["wachwerk"], namespaces: ["marke"] });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /Unbekannter Namensraum/);
});

test("ungültiger Name ergibt 400", async () => {
  const res = await call({ names: ["a"], namespaces: ["packages"] });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /mindestens 2 Zeichen/);
});

test("kein JSON ergibt 400", async () => {
  const res = await call("{nicht json", { raw: true });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /kein gültiges JSON/);
});

test("Körper über 16 KB wird abgelehnt", async () => {
  const res = await call({ names: ["wachwerk"], pad: "x".repeat(17 * 1024) });
  assert.equal(res.status, 413);
  assert.match(((await res.json()) as { error: string }).error, /16 KB/);
});

test("Rate-Limit zählt jeden Namen", async () => {
  const ip = "198.51.100.250";
  const names = Array.from({ length: 10 }, (_, i) => `limit${i}`);
  let last = 200;
  for (let i = 0; i < 7 && last !== 429; i++) {
    const res = await call({ names, namespaces: ["known_names"], sources: ["known_brands"] }, { ip });
    last = res.status;
  }
  assert.equal(last, 429);
});

// Texte der Oberfläche zu Ergebnissen der API: nie „frei“, „vergeben“ nur bei echtem Treffer.

function res(label: string, status: SourceResult["status"], weak?: boolean): SourceResult {
  return { sourceId: label, label, namespace: "packages", target: "x", status, weak };
}

test("nur „nicht zulässig“ (Ziffer am Anfang) ist weder Rot noch „vergeben“", async () => {
  const response = await call({ names: ["9zqxkvjwq"], namespaces: ["packages", "stores"] });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    ranking: ShortlistEntry[];
    reports: { verdict: string; verdictLabel: string; results: SourceResult[] }[];
  };
  const report = body.reports[0];
  assert.ok(report.results.some((r) => r.status === "invalid"));
  assert.ok(!report.results.some((r) => r.status === "taken"));
  assert.notEqual(report.verdict, "red");
  assert.notEqual(report.verdictLabel, "Vergeben");
  assert.deepEqual(body.ranking[0].taken, []);
  const summary = shortlistSummary(body.ranking[0]);
  assert.match(summary, /^nicht zulässig: /);
  assert.doesNotMatch(summary, /vergeben/);
});

test("vergeben und nicht zulässig werden in der Rangliste getrennt genannt", () => {
  const results = [res("npm", "taken"), res("crates.io", "invalid"), res("PyPI", "unknown"), res("Go", "taken", true)];
  const [entry] = rankReports([{ name: "x", verdict: "red", results }]);
  assert.equal(shortlistSummary(entry), "vergeben: npm · nicht zulässig: crates.io · 1 ohne Antwort");
});

test("Rangliste sagt „nicht gefunden“ statt „frei“ und zählt erst mit Ergebnis", () => {
  const green = [res("npm", "not_found"), res("PyPI", "not_found")];
  const ranking = rankReports([
    { name: "a", verdict: "green", results: green },
    { name: "b", verdict: "green", results: green },
    { name: "c", verdict: "red", results: [res("npm", "taken")] },
  ]);
  const texts = [
    shortlistSummary(ranking[0]),
    shortlistCount(ranking, 0),
    shortlistCount(ranking, 3),
    shortlistCount(ranking.slice(0, 1), 0),
    shortlistCount([], 10),
  ];
  for (const t of texts) assert.doesNotMatch(t, /\bfrei\b/);
  assert.equal(texts[0], "in allen Quellen nicht gefunden");
  assert.equal(texts[1], "2 Namen ohne Treffer in allen gewählten Quellen");
  assert.equal(texts[2], "Bisher 2 Namen ohne Treffer in allen gewählten Quellen");
  assert.equal(texts[3], "1 Name ohne Treffer in allen gewählten Quellen");
  // direkt nach dem Absenden kein „0 Namen …“
  assert.equal(texts[4], "Prüfung läuft …");
});
