import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addHistory,
  diffSnapshots,
  historyNames,
  MAX_HISTORY,
  MAX_SNAPSHOT_NAMES,
  MAX_SNAPSHOT_SOURCES,
  parseHistory,
  setHistoryResults,
  snapshotFromReports,
  type HistoryEntry,
  type HistorySnapshot,
} from "@/lib/history";

const AT = "2026-11-10T09:30:00.000Z";

function entry(i: number): HistoryEntry {
  return { query: `q=name${i}`, at: new Date(Date.UTC(2026, 10, 10, 9, i)).toISOString() };
}

test("parseHistory: kein Eintrag heißt Verlauf aus", () => {
  assert.equal(parseHistory(null), null);
});

test("parseHistory: leerer Verlauf ist eine leere Liste, nicht aus", () => {
  assert.deepEqual(parseHistory("[]"), []);
});

test("parseHistory: kaputtes JSON und fremde Formen ergeben eine leere Liste", () => {
  assert.deepEqual(parseHistory("{nicht json"), []);
  assert.deepEqual(parseHistory(""), []);
  assert.deepEqual(parseHistory('{"query":"q=a","at":"2026-11-10T09:30:00.000Z"}'), []);
  assert.deepEqual(parseHistory('"q=a"'), []);
  assert.deepEqual(parseHistory("null"), []);
});

test("parseHistory: unbrauchbare Einträge fallen weg, gültige bleiben in ihrer Reihenfolge", () => {
  const raw = JSON.stringify([
    { query: "q=wachwerk", at: AT },
    { query: "", at: AT },
    { query: "q=ohnezeit" },
    { query: "q=falschezeit", at: "gestern" },
    { query: 42, at: AT },
    { query: `q=${"x".repeat(2001)}`, at: AT },
    null,
    "q=text",
    { query: "q=planzeit,schichtflux&tld=de", at: AT },
  ]);
  assert.deepEqual(parseHistory(raw), [
    { query: "q=wachwerk", at: AT },
    { query: "q=planzeit,schichtflux&tld=de", at: AT },
  ]);
});

test("parseHistory: mehr als MAX_HISTORY Einträge werden auf die neuesten gekürzt", () => {
  const list = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => entry(i));
  const parsed = parseHistory(JSON.stringify(list));
  assert.equal(parsed?.length, MAX_HISTORY);
  assert.deepEqual(parsed, list.slice(0, MAX_HISTORY));
});

test("addHistory: neueste Prüfung steht vorn", () => {
  const first = addHistory([], "q=wachwerk", AT);
  const second = addHistory(first, "q=planzeit", "2026-11-10T10:00:00.000Z");
  assert.deepEqual(
    second.map((e) => e.query),
    ["q=planzeit", "q=wachwerk"],
  );
});

test("addHistory: dieselbe Auswahl steht danach nur einmal in der Liste, mit neuem Zeitpunkt", () => {
  const later = "2026-11-10T11:00:00.000Z";
  const list = addHistory(addHistory(addHistory([], "q=wachwerk", AT), "q=planzeit", AT), "q=wachwerk", later);
  assert.deepEqual(list, [
    { query: "q=wachwerk", at: later },
    { query: "q=planzeit", at: AT },
  ]);
});

test("addHistory: höchstens MAX_HISTORY Einträge, der älteste fällt weg", () => {
  const full = Array.from({ length: MAX_HISTORY }, (_, i) => entry(i));
  const next = addHistory(full, "q=neu", AT);
  assert.equal(next.length, MAX_HISTORY);
  assert.deepEqual(next[next.length - 1], full[MAX_HISTORY - 2]);
});

test("addHistory: leere Abfrage oder ungültiger Zeitpunkt ändern nichts", () => {
  const list = [entry(1)];
  assert.deepEqual(addHistory(list, "", AT), list);
  assert.deepEqual(addHistory(list, "q=wachwerk", "kein datum"), list);
  // Ergebnis ist eine Kopie, die Eingabe bleibt unverändert
  assert.notEqual(addHistory(list, "", AT), list);
});

test("historyNames: Namen aus q=, ohne Leereinträge und Auswahl", () => {
  assert.deepEqual(historyNames({ query: "q=wachwerk,%20planzeit,,&tld=de,com&ns=domains", at: AT }), [
    "wachwerk",
    "planzeit",
  ]);
  assert.deepEqual(historyNames({ query: "q=foo%20bar", at: AT }), ["foo bar"]);
  assert.deepEqual(historyNames({ query: "tld=de", at: AT }), []);
});

test("parseHistory: Einträge ohne Ergebnis (älterer Verlauf) bleiben gültig, mit Ergebnis bleibt es erhalten", () => {
  const results: HistorySnapshot = { wachwerk: { "rdap:de": "n", npm: "t", "known_brands": "tw" } };
  const raw = JSON.stringify([
    { query: "q=wachwerk", at: AT, results },
    { query: "q=planzeit", at: AT },
  ]);
  assert.deepEqual(parseHistory(raw), [
    { query: "q=wachwerk", at: AT, results },
    { query: "q=planzeit", at: AT },
  ]);
});

test("parseHistory: ein unbrauchbares Ergebnis fällt weg, der Eintrag bleibt", () => {
  const tooManyNames = Object.fromEntries(
    Array.from({ length: MAX_SNAPSHOT_NAMES + 1 }, (_, i) => [`name${i}`, { npm: "n" }]),
  );
  const tooManySources = {
    wachwerk: Object.fromEntries(Array.from({ length: MAX_SNAPSHOT_SOURCES + 1 }, (_, i) => [`src${i}`, "n"])),
  };
  const broken = [
    "kaputt",
    [],
    {},
    { wachwerk: "n" },
    { wachwerk: { npm: "frei" } },
    { wachwerk: { npm: "x" } },
    { wachwerk: { npm: 1 } },
    { "": { npm: "n" } },
    tooManyNames,
    tooManySources,
  ];
  for (const results of broken) {
    assert.deepEqual(parseHistory(JSON.stringify([{ query: "q=wachwerk", at: AT, results }])), [
      { query: "q=wachwerk", at: AT },
    ]);
  }
});

test("addHistory: der neue Eintrag hat noch kein Ergebnis, auch wenn der alte eins hatte", () => {
  const old: HistoryEntry = { query: "q=wachwerk", at: AT, results: { wachwerk: { npm: "n" } } };
  const later = "2026-11-10T11:00:00.000Z";
  assert.deepEqual(addHistory([old], "q=wachwerk", later), [{ query: "q=wachwerk", at: later }]);
});

test("setHistoryResults: legt das Ergebnis nur im Eintrag mit derselben Auswahl ab", () => {
  const list = addHistory(addHistory([], "q=wachwerk", AT), "q=planzeit", AT);
  const results: HistorySnapshot = { wachwerk: { npm: "t" } };
  assert.deepEqual(setHistoryResults(list, "q=wachwerk", results), [
    { query: "q=planzeit", at: AT },
    { query: "q=wachwerk", at: AT, results },
  ]);
  // Ohne passenden Eintrag oder mit ungültigem Ergebnis ändert sich nichts
  assert.deepEqual(setHistoryResults(list, "q=fremd", results), list);
  assert.deepEqual(setHistoryResults(list, "q=wachwerk", { wachwerk: { npm: "frei" } }), list);
});

test("snapshotFromReports: Kurzcodes je Name und Quelle, schwache Treffer mit „w“, gekürzt auf die Obergrenzen", () => {
  const snapshot = snapshotFromReports([
    {
      name: "wachwerk",
      results: [
        { sourceId: "rdap:de", status: "not_found" },
        { sourceId: "npm", status: "taken" },
        { sourceId: "known_brands", status: "taken", weak: true },
        { sourceId: "pypi", status: "unknown" },
      ],
    },
  ]);
  assert.deepEqual(snapshot, { wachwerk: { "rdap:de": "n", npm: "t", known_brands: "tw", pypi: "u" } });

  const many = Array.from({ length: MAX_SNAPSHOT_NAMES + 2 }, (_, i) => ({
    name: `name${i}`,
    results: Array.from({ length: MAX_SNAPSHOT_SOURCES + 5 }, (_, j) => ({ sourceId: `s${j}`, status: "not_found" as const })),
  }));
  const capped = snapshotFromReports(many);
  assert.equal(Object.keys(capped).length, MAX_SNAPSHOT_NAMES);
  assert.equal(Object.keys(capped.name0).length, MAX_SNAPSHOT_SOURCES);
  // Was snapshotFromReports schreibt, liest parseHistory wieder
  assert.deepEqual(parseHistory(JSON.stringify([{ query: "q=a", at: AT, results: capped }]))?.[0].results, capped);
});

test("diffSnapshots: nichts geändert ergibt keine Änderung", () => {
  const same: HistorySnapshot = { wachwerk: { "rdap:de": "n", "rdap:com": "t", npm: "n" } };
  assert.deepEqual(diffSnapshots(same, structuredClone(same)), []);
});

test("diffSnapshots: eine Endung ist neu vergeben", () => {
  const before: HistorySnapshot = { wachwerk: { "rdap:de": "n", "rdap:com": "n" }, planzeit: { "rdap:de": "n" } };
  const after: HistorySnapshot = { wachwerk: { "rdap:de": "n", "rdap:com": "t" }, planzeit: { "rdap:de": "n" } };
  assert.deepEqual(diffSnapshots(before, after), [
    {
      name: "wachwerk",
      sourceId: "rdap:com",
      from: { status: "not_found", weak: false },
      to: { status: "taken", weak: false },
    },
  ]);
});

test("diffSnapshots: „unbekannt“ auf einer Seite ist keine Änderung", () => {
  const before: HistorySnapshot = { wachwerk: { npm: "u", pypi: "t" } };
  const after: HistorySnapshot = { wachwerk: { npm: "t", pypi: "u" } };
  assert.deepEqual(diffSnapshots(before, after), []);
});

test("diffSnapshots: Quellen und Namen, die nur auf einer Seite vorkommen, zählen nicht", () => {
  const before: HistorySnapshot = { wachwerk: { npm: "n", "rdap:de": "n" }, alt: { npm: "n" } };
  const after: HistorySnapshot = {
    wachwerk: { npm: "n", "rdap:io": "t", known_brands: "tw" },
    neu: { npm: "t" },
  };
  assert.deepEqual(diffSnapshots(before, after), []);
});

test("diffSnapshots: aus schwachem wird harter Treffer; „schwach“ ohne „vergeben“ zählt nicht", () => {
  const before: HistorySnapshot = { wachwerk: { known_brands: "tw", social: "n" } };
  const after: HistorySnapshot = { wachwerk: { known_brands: "t", social: "nw" } };
  assert.deepEqual(diffSnapshots(before, after), [
    {
      name: "wachwerk",
      sourceId: "known_brands",
      from: { status: "taken", weak: true },
      to: { status: "taken", weak: false },
    },
  ]);
});
