import { test } from "node:test";
import assert from "node:assert/strict";
import { analyticsEnabled, cleanPath, externalReferrerOrigin } from "@/lib/analytics";

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
