import { test } from "node:test";
import assert from "node:assert/strict";
import { checkName } from "@/lib/engine/check";
import { buildJsonExport, deriveRun, nextItem, type Item, type Run } from "@/components/check-run";

// Berichte offline: nur die Marken-Heuristik (kein Netz).
const report = (name: string) => checkName(name, { sources: ["known_brands"], namespaces: ["known_names"] });

const sel = (names: string[]) => ({ names, namespaces: [], tlds: [], extra: [] });

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
    sel: { names: ["github", "wachwerk", "offen"], namespaces: ["known_names"], tlds: ["de"], extra: ["npm"] },
    items: { github: { state: "done", report: b }, wachwerk: { state: "done", report: a }, offen: { state: "loading" } },
  };
  const { data, reports } = buildJsonExport(run, "2026-11-07T10:00:00.000Z");
  assert.deepEqual(reports.map((r) => r.name), ["github", "wachwerk"]);
  assert.equal(data.exportedAt, "2026-11-07T10:00:00.000Z");
  assert.match(data.note, /keine Rechtsberatung/);
  assert.deepEqual(data.query, { names: ["github", "wachwerk", "offen"], namespaces: ["known_names"], tlds: ["de"], sources: ["npm"] });
  assert.deepEqual(data.ranking.map((e) => e.name), ["wachwerk", "github"]);
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
