import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyticsEnabled, cleanPath, externalReferrerOrigin, type AnalyticsEvent } from "@/lib/analytics";

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("cleanPath entfernt Query und Fragment, damit geprüfte Namen nie übertragen werden", () => {
  assert.equal(cleanPath("/"), "/");
  assert.equal(cleanPath("/quellen"), "/quellen");
  assert.equal(cleanPath("/?q=wachwerk,react&tld=de"), "/");
  assert.equal(cleanPath("/quellen#ampel"), "/quellen");
  assert.equal(cleanPath("/?q=geheim#x"), "/");
  assert.equal(cleanPath(`/${"a".repeat(500)}`).length, 200);
});

test("externalReferrerOrigin gibt nur die Origin einer externen Seite zurück", () => {
  assert.equal(externalReferrerOrigin("", "markenfrei.app"), "");
  assert.equal(externalReferrerOrigin("https://news.ycombinator.com/item?id=1&q=privat", "markenfrei.app"), "https://news.ycombinator.com");
  assert.equal(externalReferrerOrigin("https://markenfrei.app/quellen?q=x", "markenfrei.app"), "", "eigene Seite zählt nicht");
  assert.equal(externalReferrerOrigin("https://www.markenfrei.app/", "markenfrei.app"), "", "www zählt als eigene Seite");
  assert.equal(externalReferrerOrigin("android-app://com.google.android.gm", "markenfrei.app"), "", "fremde Schemata werden verworfen");
  assert.equal(externalReferrerOrigin("kein url", "markenfrei.app"), "");
});

test("Do Not Track und Global Privacy Control schalten die Messung ab", () => {
  const nav = (o: object) => o as Navigator;
  assert.equal(analyticsEnabled(nav({ doNotTrack: null })), true);
  assert.equal(analyticsEnabled(nav({ doNotTrack: "0" })), true);
  assert.equal(analyticsEnabled(nav({ doNotTrack: "1" })), false);
  assert.equal(analyticsEnabled(nav({ doNotTrack: null, globalPrivacyControl: true })), false);
  assert.equal(analyticsEnabled(undefined), false);
});

test("export/ics ist kein Ereignis mehr", () => {
  // @ts-expect-error export/ics ist aus AnalyticsEvent entfernt; tsc muss hier den Fehler melden
  const e: AnalyticsEvent = "export/ics";
  assert.equal(e, "export/ics");
});

test("exportIcs ruft trackEvent nicht auf, die anderen Exporte zählen weiter", () => {
  const src = read("src/components/checker.tsx");
  const start = src.indexOf("function exportIcs()");
  assert.notEqual(start, -1, "function exportIcs fehlt");
  const end = src.indexOf("\n  function ", start + 1);
  assert.notEqual(end, -1, "Ende von exportIcs nicht gefunden");
  const body = src.slice(start, end);
  assert.match(body, /downloadFile\(/, "der Rumpf muss den Download enthalten, sonst ist der Ausschnitt falsch");
  assert.doesNotMatch(body, /trackEvent/, "exportIcs darf nicht zählen");
  for (const ev of ["export/json", "export/csv", "export/markdown"]) {
    const count = src.split(`trackEvent("${ev}")`).length - 1;
    assert.equal(count, 1, `${ev} wird genau einmal gezählt`);
  }
});

test("docs/analytics.md nennt export/ics nicht als Ereignis", () => {
  const doc = read("docs/analytics.md");
  assert.doesNotMatch(doc, /export\/ics/, "export/ics ist kein gezähltes Ereignis mehr");
  assert.match(doc, /Die Kalender-Erinnerung \(\.ics\) wird nicht gezählt\./);
});
