import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVerdictBar } from "@/lib/verdict-bar";
import type { Status } from "@/lib/engine/types";

const r = (status: Status, weak?: boolean) => ({ status, ...(weak ? { weak } : {}) });

test("Zählung nach Anzahl, feste Reihenfolge, Text statt Prozent", () => {
  const results = [...Array(2).fill(r("taken")), ...Array(20).fill(r("not_found")), r("unknown")];
  const bar = buildVerdictBar(results);
  assert.equal(bar.countText, "2 vergeben · 0 Treffer prüfen · 20 nicht gefunden · 1 unbekannt");
  assert.deepEqual(
    bar.segments.map((s) => [s.key, s.count]),
    [
      ["taken", 2],
      ["similar", 0],
      ["not_found", 20],
      ["unknown", 1],
    ],
  );
  assert.equal(bar.total, 23);
  assert.doesNotMatch(bar.countText + bar.ariaLabel, /%/);
});

test("nur unbekannt ist schraffiert", () => {
  const bar = buildVerdictBar([r("unknown")]);
  assert.deepEqual(bar.segments.filter((s) => s.hatched).map((s) => s.key), ["unknown"]);
});

test("invalid zählt wie unbekannt und wird benannt", () => {
  const bar = buildVerdictBar([r("invalid"), r("unknown"), r("not_found")]);
  assert.equal(bar.segments[3].count, 2);
  assert.equal(bar.invalid, 1);
  assert.match(bar.countText, /2 unbekannt \(davon 1 nicht zulässig\)/);
  assert.match(bar.ariaLabel, /2 unbekannt/);
});

test("schwacher Treffer zählt als Treffer prüfen, nicht als vergeben", () => {
  const bar = buildVerdictBar([r("taken", true), r("similar")]);
  assert.equal(bar.segments[0].count, 0);
  assert.equal(bar.segments[1].count, 2);
});

test("leere Liste: alles 0, nichts erfunden", () => {
  const bar = buildVerdictBar([]);
  assert.equal(bar.total, 0);
  assert.equal(bar.countText, "0 vergeben · 0 Treffer prüfen · 0 nicht gefunden · 0 unbekannt");
});
