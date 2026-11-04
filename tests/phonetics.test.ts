import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTrademarkSafety, koelnerPhonetik, koelnerPhonetikRaw, PROTECTED_TECH_BRANDS } from "@/lib/phonetics";

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

test("Kölner Phonetik: Referenzwerte (Wikipedia)", () => {
  assert.equal(koelnerPhonetikRaw("Müller-Lüdenscheidt"), "60550750206880022");
  assert.equal(koelnerPhonetik("Müller-Lüdenscheidt"), "65752682");
  assert.equal(koelnerPhonetik("Wikipedia"), "3412");
  assert.equal(koelnerPhonetik("Breschnew"), "17863");
});

test("Kölner Phonetik: fehlendes Nachbarzeichen am Wortende/-anfang", () => {
  // D/T am Ende: 2 (nicht 8, denn "csz".includes("") ist true)
  assert.equal(koelnerPhonetik("brot"), "172");
  assert.equal(koelnerPhonetik("Schmidt"), "862");
  // C allein bzw. am Ende: 8 (nicht 4)
  assert.equal(koelnerPhonetik("c"), "8");
  assert.equal(koelnerPhonetik("bac"), "18");
  // X am Anfang: 48 (nicht 8)
  assert.equal(koelnerPhonetik("Xaver"), "4837");
});

test("Kölner Phonetik: Kontextregeln", () => {
  assert.equal(koelnerPhonetik("Klarna"), koelnerPhonetik("Clarna"));
  assert.equal(koelnerPhonetik("Philipp"), "351"); // PH -> 3, P sonst 1
  assert.equal(koelnerPhonetik("Chris"), "478"); // C im Anlaut vor H -> 4
  assert.equal(koelnerPhonetik("Lachs"), "548"); // C nach A vor H -> 4, X-Regel nicht betroffen
  assert.equal(koelnerPhonetik("Anna"), "06"); // führende 0 bleibt
  assert.equal(koelnerPhonetik("123"), "");
});

test("PROTECTED_TECH_BRANDS hat 89 eindeutige Einträge", () => {
  assert.equal(PROTECTED_TECH_BRANDS.length, 89);
  assert.equal(new Set(PROTECTED_TECH_BRANDS).size, 89);
});
