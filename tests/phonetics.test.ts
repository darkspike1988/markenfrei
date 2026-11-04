import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTrademarkSafety, koelnerPhonetik } from "@/lib/phonetics";

test("Kölner Phonetik gleicht Meier und Mayer an", () => {
  assert.equal(koelnerPhonetik("Meier"), koelnerPhonetik("Mayer"));
});

test("bekannte Marke wird als identisch erkannt", () => {
  const a = analyzeTrademarkSafety("google");
  assert.equal(a.protectedCollisions[0]?.matchType, "identisch");
});

test("Fantasiewort ohne Treffer hat keine Kollision", () => {
  const a = analyzeTrademarkSafety("zzqxkvjw");
  assert.equal(a.protectedCollisions.length, 0);
});

test("Register-Links enthalten den bereinigten Namen, auch bei Umlauten", () => {
  const links = analyzeTrademarkSafety("Müller").registryLinks;
  assert.match(links.tmdb, /tmdb\.eu\/de\/suche\/marken\?q=mueller/);
  assert.match(links.tmview, /basicSearch=mueller/);
  assert.match(links.dpma, /register\.dpma\.de/);
});
