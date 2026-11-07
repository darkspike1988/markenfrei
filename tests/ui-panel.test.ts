import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VerdictPanel } from "@/components/verdict-panel";
import { MatchList } from "@/components/match-list";
import type { NameReport } from "@/lib/engine/check";
import type { SourceResult, Status } from "@/lib/engine/types";
import { computeVerdict, countStatuses, VERDICT_LABEL } from "@/lib/engine/verdict";
import { trademarkPrep } from "@/lib/engine/trademark-prep";

function report(statuses: Status[]): NameReport {
  const results: SourceResult[] = statuses.map((status, i) => ({
    sourceId: `s${i}`,
    namespace: "packages",
    label: `Q${i}`,
    target: "wachwerk",
    status,
  }));
  const verdict = computeVerdict(results);
  return {
    schemaVersion: 2,
    input: "wachwerk",
    name: "wachwerk",
    checkedAt: "2026-11-07T10:00:00.000Z",
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    counts: countStatuses(results),
    incomplete: results.filter((r) => r.status === "unknown").map((r) => r.label),
    results,
    trademark: trademarkPrep("wachwerk"),
    manualLinks: [],
  };
}

test("Urteilsfeld rot: Symbol, Wort und Zählung, nicht nur Farbe", () => {
  const html = renderToStaticMarkup(createElement(VerdictPanel, { report: report(["taken", "taken", "not_found", "unknown"]) }));
  assert.match(html, /✕/);
  assert.match(html, /Ampel Rot/);
  assert.match(html, /Vergeben/);
  // Sichtbarer Text ohne Markup: Jede Angabe steht in einer eigenen Hülle, damit sie nicht mitten im Wort umbricht.
  assert.match(html.replace(/<[^>]+>/g, "").replace(/\s+/g, " "), /2 vergeben · 0 Treffer prüfen · 1 nicht gefunden · 1 unbekannt/);
  assert.equal((html.match(/whitespace-nowrap">\d+ [^<]+</g) ?? []).length, 4, "vier unteilbare Angaben");
  assert.doesNotMatch(html, />\s*·\s*<span/, "kein Trennzeichen am Anfang einer Angabe");
  assert.match(html, /role="img" aria-label="Quellen: 2 vergeben, 0 Treffer prüfen, 1 nicht gefunden, 1 unbekannt"/);
  assert.match(html, /bar-hatch/);
});

test("Urteilsfeld grün: sagt Keine Treffer, nie frei oder registrierbar", () => {
  const html = renderToStaticMarkup(createElement(VerdictPanel, { report: report(["not_found", "not_found"]) }));
  assert.match(html, /Keine Treffer/);
  assert.match(html, /heißt nicht „registrierbar“/);
  assert.doesNotMatch(html, /bar-hatch/);
  assert.doesNotMatch(html, /%/);
});

test("Urteilsfeld gelb hat eigenes Symbol", () => {
  const html = renderToStaticMarkup(createElement(VerdictPanel, { report: report(["similar", "not_found"]) }));
  assert.match(html, /▲/);
  assert.match(html, /Ampel Gelb/);
});

test("MatchList: Chip mit Symbol und Wort, Hervorhebung, Hinweis, keine Prozent", () => {
  const html = renderToStaticMarkup(
    createElement(MatchList, {
      name: "spotfy",
      matches: [
        { label: "Spotify", kind: "schreibaehnlich", id: "Q689141" },
        { label: "Spot", kind: "enthalten" },
        { label: "Sputnik", kind: "klanggleich" },
        { label: "Spotfy", kind: "gleich" },
      ],
    }),
  );
  assert.match(html, /<mark[^>]*>Spot<\/mark>/);
  for (const w of ["schreibähnlich", "enthalten", "klanggleich", "gleich"]) assert.ok(html.includes(w), w);
  for (const s of ["Aa", "[ ]", "♪", "="]) assert.ok(html.includes(s), s);
  assert.match(html, /Ähnlichkeit ist nur ein Hinweis, kein Rechtsbefund; kein Treffer ist keine Freigabe\./);
  assert.match(html, /Q689141/);
  assert.doesNotMatch(html, /%/);
});

test("MatchList ohne Treffer rendert nichts", () => {
  assert.equal(renderToStaticMarkup(createElement(MatchList, { name: "x", matches: [] })), "");
});
