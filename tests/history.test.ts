import { test } from "node:test";
import assert from "node:assert/strict";
import { addHistory, historyNames, MAX_HISTORY, parseHistory, type HistoryEntry } from "@/lib/history";

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
