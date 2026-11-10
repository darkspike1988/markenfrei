import { test } from "node:test";
import assert from "node:assert/strict";
import { checkName } from "@/lib/engine/check";
import type { SourceResult, Status } from "@/lib/engine/types";
import {
  buildJsonExport,
  cancelRun,
  CANCELLED_MESSAGE,
  deriveRun,
  mergeResults,
  nextItem,
  remainingFeaturedTlds,
  tldBatches,
  type Item,
  type Run,
} from "@/components/check-run";

// Berichte offline: nur die Marken-Heuristik (kein Netz).
const report = (name: string) => checkName(name, { sources: ["known_brands"], namespaces: ["known_names"] });

const sel = (names: string[]) => ({ names, namespaces: [], tlds: [], extra: [], excluded: [] });

const domainRow = (tld: string, status: Status): SourceResult => ({
  sourceId: `rdap:${tld}`,
  namespace: "domains",
  label: `.${tld}`,
  target: `wachwerk.${tld}`,
  status,
});

test("deriveRun: ohne Lauf alles leer, nicht fertig", () => {
  const v = deriveRun(null);
  assert.deepEqual([v.names, v.done, v.pending, v.failed, v.ranked, v.latestCheck, v.finished, v.firstOpen], [[], [], [], [], [], "", false, undefined]);
});

test("deriveRun: Rangfolge frei zuerst, offene und fehlgeschlagene Namen getrennt, fertig erst ohne Wartende", async () => {
  const [free, taken] = await Promise.all([report("wachwerk"), report("github")]);
  const items: Record<string, Item> = {
    github: { state: "done", report: taken },
    wachwerk: { state: "done", report: free },
    offen: { state: "loading" },
    kaputt: { state: "error", message: "x" },
  };
  const run: Run = { id: 1, sel: sel(["github", "wachwerk", "offen", "kaputt"]), items };
  const v = deriveRun(run);
  assert.deepEqual(v.ranking.map((e) => e.name), ["wachwerk", "github"]);
  assert.deepEqual(v.ranked.map((r) => r.name), ["wachwerk", "github"]);
  assert.deepEqual(v.pending, ["offen"]);
  assert.deepEqual(v.failed, ["kaputt"]);
  assert.equal(v.finished, false);
  assert.equal(v.firstOpen, "github", "erster Name mit Treffer oder Lücke wird aufgeklappt");
  assert.equal(v.latestCheck, [free.checkedAt, taken.checkedAt].sort().at(-1));

  const finished = deriveRun({ ...run, items: { ...items, offen: { state: "error", message: "y" } } });
  assert.equal(finished.finished, true);
});

test("deriveRun: Eingaben, die zum selben Namen normalisieren, zählen einmal", async () => {
  const r = await report("Wachwerk");
  const run: Run = {
    id: 2,
    sel: sel(["Wachwerk", "wachwerk"]),
    items: { Wachwerk: { state: "done", report: r }, wachwerk: { state: "done", report: r } },
  };
  assert.equal(deriveRun(run).done.length, 1);
});

test("buildJsonExport: nur fertige Berichte in Eingabereihenfolge, mit Hinweis, Abfrage und Rangliste", async () => {
  const [a, b] = await Promise.all([report("wachwerk"), report("github")]);
  const run: Run = {
    id: 3,
    sel: { names: ["github", "wachwerk", "offen"], namespaces: ["known_names"], tlds: ["de"], extra: ["npm"], excluded: [] },
    items: { github: { state: "done", report: b }, wachwerk: { state: "done", report: a }, offen: { state: "loading" } },
  };
  const { data, reports } = buildJsonExport(run, "2026-11-07T10:00:00.000Z");
  assert.deepEqual(reports.map((r) => r.name), ["github", "wachwerk"]);
  assert.equal(data.exportedAt, "2026-11-07T10:00:00.000Z");
  assert.match(data.note, /keine Rechtsberatung/);
  assert.deepEqual(data.query, { names: ["github", "wachwerk", "offen"], namespaces: ["known_names"], tlds: ["de"], sources: ["npm"] });
  assert.deepEqual(data.ranking.map((e) => e.name), ["wachwerk", "github"]);
});

test("buildJsonExport: abgewählte Standardquellen stehen in der Abfrage, wenn es welche gibt", async () => {
  const r = await report("wachwerk");
  const run: Run = {
    id: 4,
    sel: { names: ["wachwerk"], namespaces: ["packages"], tlds: ["de"], extra: ["pub"], excluded: ["npm"] },
    items: { wachwerk: { state: "done", report: r } },
  };
  assert.deepEqual(buildJsonExport(run, "2026-11-07T10:00:00.000Z").data.query.excludedSources, ["npm"]);
});

test("mergeResults: neue Endung „vergeben“ macht aus Grün Rot, Zählung und Ampeltext folgen", async () => {
  const free = await report("wachwerk");
  assert.equal(free.verdict, "green");
  const merged = mergeResults(free, [domainRow("shop", "not_found"), domainRow("xyz", "taken")]);
  assert.equal(merged.verdict, "red");
  assert.equal(merged.verdictLabel, "Vergeben");
  assert.equal(merged.counts.taken, 1);
  assert.equal(merged.counts.not_found, free.counts.not_found + 1);
  assert.deepEqual(merged.results.slice(-2).map((r) => r.sourceId), ["rdap:shop", "rdap:xyz"], "angehängt");
  assert.equal(free.results.length, merged.results.length - 2, "der alte Bericht bleibt unverändert");
});

test("mergeResults: Zeilen ohne Antwort landen in incomplete und machen Grün zu Gelb", async () => {
  const free = await report("wachwerk");
  const merged = mergeResults(free, [domainRow("at", "unknown")]);
  assert.equal(merged.verdict, "yellow");
  assert.deepEqual(merged.incomplete, [".at"]);
  assert.equal(merged.counts.unknown, 1);
});

test("mergeResults: zweimal dasselbe einfügen fügt nichts hinzu, vorhandene Quellen bleiben, wie sie sind", async () => {
  const free = await report("wachwerk");
  const once = mergeResults(free, [domainRow("shop", "not_found")]);
  const twice = mergeResults(once, [domainRow("shop", "taken")]);
  assert.equal(twice, once);
  assert.equal(twice.results.filter((r) => r.sourceId === "rdap:shop").length, 1);
  assert.equal(mergeResults(free, []), free);
});

test("remainingFeaturedTlds und tldBatches: fehlende kuratierte Endungen in Gruppen von höchstens max", async () => {
  const r = mergeResults(await report("wachwerk"), [domainRow("de", "not_found"), domainRow("com", "taken")]);
  assert.deepEqual(remainingFeaturedTlds(r, ["de", "com", "net", "org", "io"]), ["net", "org", "io"]);
  assert.deepEqual(tldBatches(["a", "b", "c", "d", "e"], 2), [["a", "b"], ["c", "d"], ["e"]]);
  assert.deepEqual(tldBatches([], 8), []);
});

test("nextItem: eine neue Antwort behält nachgeprüfte Endungen des alten Berichts", async () => {
  const [old, fresh] = await Promise.all([report("wachwerk"), report("wachwerk")]);
  const extended = mergeResults(old, [domainRow("shop", "taken")]);
  const next = nextItem({ state: "done", report: extended }, { ok: true, report: fresh });
  assert.equal(next.state, "done");
  if (next.state !== "done") return;
  assert.ok(next.report.results.some((r) => r.sourceId === "rdap:shop"));
  assert.equal(next.report.verdict, "red");
  assert.equal(next.report.checkedAt, fresh.checkedAt);
});

test("deriveRun: Nachprüfen weiterer Endungen hält den Lauf im Zustand „läuft“, Abbrechen beendet es", async () => {
  const r = await report("wachwerk");
  const run: Run = {
    id: 7,
    sel: sel(["wachwerk"]),
    items: { wachwerk: { state: "done", report: r, extending: { checked: 8, total: 28 } } },
  };
  const v = deriveRun(run);
  assert.equal(v.extending, true);
  assert.equal(v.signal, "checking");
  const cancelled = deriveRun(cancelRun(run));
  assert.equal(cancelled.extending, false);
  assert.equal(cancelled.signal, "green");
});

test("nextItem: erster Fehler ohne Vorgänger oder während des Ladens ist ein Fehler", () => {
  assert.deepEqual(nextItem(undefined, { ok: false, message: "x" }), { state: "error", message: "x" });
  assert.deepEqual(nextItem({ state: "loading" }, { ok: false, message: "x" }), { state: "error", message: "x" });
});

test("nextItem: Fehler bei vorhandenem Bericht behält ihn und setzt retryError, ohne Wartehinweis", async () => {
  const r = await report("wachwerk");
  const prev: Item = { state: "done", report: r, waiting: { attempt: 1, max: 6 }, rechecking: true };
  assert.deepEqual(nextItem(prev, { ok: false, message: "HTTP 429" }), { state: "done", report: r, retryError: "HTTP 429" });
});

test("nextItem: Erfolg löscht retryError und ersetzt den Bericht", async () => {
  const [old, fresh] = await Promise.all([report("wachwerk"), report("github")]);
  const prev: Item = { state: "done", report: old, retryError: "HTTP 429" };
  const next = nextItem(prev, { ok: true, report: fresh });
  assert.deepEqual(next, { state: "done", report: fresh });
  assert.equal("retryError" in next, false);
});

test("deriveRun: Signal läuft, solange Namen offen sind oder Quellen nachgeprüft werden, sonst die schlechteste Ampel", async () => {
  const [free, taken] = await Promise.all([report("wachwerk"), report("github")]);
  assert.equal(deriveRun(null).signal, null);
  const run = (items: Record<string, Item>): Run => ({ id: 5, sel: sel(Object.keys(items)), items });

  const open = deriveRun(run({ wachwerk: { state: "done", report: free }, offen: { state: "loading" } }));
  assert.equal(open.signal, "checking");

  const waiting = deriveRun(run({ wachwerk: { state: "done", report: free, waiting: { attempt: 1, max: 6 } } }));
  assert.equal(waiting.finished, true);
  assert.equal(waiting.rechecking, true);
  assert.equal(waiting.signal, "checking", "automatisches Nachprüfen gilt nicht als fertig grün");

  const done = deriveRun(run({ wachwerk: { state: "done", report: free }, github: { state: "done", report: taken } }));
  assert.deepEqual(done.tally, { green: 1, yellow: 0, red: 1 });
  assert.equal(done.signal, "red");
  assert.equal(deriveRun(run({ wachwerk: { state: "done", report: free } })).signal, "green");
  assert.equal(deriveRun(run({ kaputt: { state: "error", message: "x" } })).signal, null, "ohne Bericht keine Ampel");
});

test("cancelRun: offene Namen werden zu Fehlerzeilen, Berichte bleiben, Nachprüfen endet", async () => {
  const r = await report("wachwerk");
  const run: Run = {
    id: 6,
    sel: sel(["wachwerk", "wartet", "offen", "kaputt", "alt"]),
    items: {
      wachwerk: { state: "done", report: r },
      wartet: { state: "done", report: r, waiting: { attempt: 2, max: 6 }, rechecking: true },
      offen: { state: "loading" },
      kaputt: { state: "error", message: "x" },
      alt: { state: "done", report: r, retryError: "HTTP 500", rechecking: true },
    },
  };
  const cancelled = cancelRun(run);
  assert.deepEqual(cancelled.items, {
    wachwerk: { state: "done", report: r },
    wartet: { state: "done", report: r },
    offen: { state: "error", message: CANCELLED_MESSAGE },
    kaputt: { state: "error", message: "x" },
    alt: { state: "done", report: r, retryError: "HTTP 500" },
  });
  const view = deriveRun(cancelled);
  assert.equal(view.finished, true);
  assert.equal(view.rechecking, false);
  assert.notEqual(view.signal, "checking");
  assert.equal(run.items.offen.state, "loading", "der ursprüngliche Lauf bleibt unverändert");
});

import { changeLines, isSettled } from "@/components/check-run";

test("isSettled: erst ohne offene Namen, Nachprüfen und Endungen in Arbeit, und nur mit einem Bericht", async () => {
  const r = await report("wachwerk");
  const settledFor = (items: Record<string, Item>) => isSettled(deriveRun({ id: 1, sel: sel(Object.keys(items)), items }));
  assert.equal(isSettled(deriveRun(null)), false);
  assert.equal(settledFor({ wachwerk: { state: "done", report: r } }), true);
  assert.equal(settledFor({ wachwerk: { state: "done", report: r }, planzeit: { state: "loading" } }), false);
  assert.equal(settledFor({ wachwerk: { state: "done", report: r, waiting: { attempt: 1, max: 6 } } }), false);
  assert.equal(settledFor({ wachwerk: { state: "done", report: r, rechecking: true } }), false);
  assert.equal(settledFor({ wachwerk: { state: "done", report: r, extending: { checked: 0, total: 3 } } }), false);
  assert.equal(settledFor({ wachwerk: { state: "error", message: "x" } }), false);
  assert.equal(settledFor({ wachwerk: { state: "done", report: r }, kaputt: { state: "error", message: "x" } }), true);
});

test("changeLines: Name · Beschriftung aus dem Bericht: alter → neuer Status; unbekannte Quelle mit ID", async () => {
  const r = mergeResults(await report("wachwerk"), [domainRow("com", "taken")]);
  const lines = changeLines(
    [
      { name: "wachwerk", sourceId: "rdap:com", from: { status: "not_found", weak: false }, to: { status: "taken", weak: false } },
      { name: "wachwerk", sourceId: "known_brands", from: { status: "taken", weak: true }, to: { status: "taken", weak: false } },
      { name: "wachwerk", sourceId: "weg", from: { status: "similar", weak: false }, to: { status: "invalid", weak: false } },
    ],
    [r],
  );
  const brands = r.results.find((x) => x.sourceId === "known_brands")?.label;
  assert.ok(brands);
  assert.deepEqual(lines, [
    "wachwerk · .com: nicht gefunden → vergeben",
    `wachwerk · ${brands}: vergeben (schwaches Signal) → vergeben`,
    "wachwerk · weg: ähnlich → nicht zulässig",
  ]);
});
