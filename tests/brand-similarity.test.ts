import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { koelnerPhonetik, levenshtein } from "@/lib/phonetics";
import {
  buildBrandIndex,
  compareWithBrands,
  type BrandEntry,
} from "@/lib/brand-similarity";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/brands-mini.json", import.meta.url), "utf8")) as {
  abgerufen: string;
  anzahl: number;
  marken: BrandEntry[];
};
const index = buildBrandIndex(fixture.marken);

test("Fixture: Format und Sortierung", () => {
  assert.equal(fixture.anzahl, fixture.marken.length);
  assert.ok(fixture.marken.length >= 12);
  const keys = fixture.marken.map((m) => m[0]);
  assert.deepEqual(keys, [...keys].sort());
  for (const k of ["fendrix", "brausol", "tomorin", "lunabar"]) assert.ok(keys.includes(k));
});

test("gleich: fendrix → Fendrix", () => {
  const r = compareWithBrands("fendrix", index, fixture.abgerufen);
  assert.equal(r.hits[0].kind, "gleich");
  assert.equal(r.hits[0].label, "Fendrix");
  assert.equal(r.hits[0].id, "Q900007");
  assert.match(r.url ?? "", /tmdn\.org\/tmview.*basicSearch=Fendrix$/);
  assert.match(r.note ?? "", /Gleicht der Marke „Fendrix“ \(Wikidata, Stand 2000-01-01\), nur Hinweis/);
});

test("gleich: Bindestriche zählen nicht", () => {
  assert.equal(compareWithBrands("fend-rix", index).hits[0].kind, "gleich");
});

test("klanggleich: phendrix → Fendrix", () => {
  assert.equal(koelnerPhonetik("phendrix"), "362748");
  assert.equal(koelnerPhonetik("fendrix"), "362748");
  assert.equal(levenshtein("phendrix", "fendrix"), 2);
  const r = compareWithBrands("phendrix", index, fixture.abgerufen);
  assert.equal(r.hits[0].kind, "klanggleich");
  assert.equal(r.hits[0].label, "Fendrix");
  assert.equal(r.hits[0].code, "362748");
  assert.equal(r.hits[0].distance, 2);
  assert.match(r.note ?? "", /Klingt wie die Marke „Fendrix“ \(Wikidata, Stand 2000-01-01\), nur Hinweis/);
  assert.match(r.evidence ?? "", /Q900007, Kölner 362748, Levenshtein 2/);
});

test("schreibähnlich: fendrik → Fendrix", () => {
  assert.notEqual(koelnerPhonetik("fendrik"), koelnerPhonetik("fendrix"));
  const r = compareWithBrands("fendrik", index);
  assert.equal(r.hits[0].kind, "schreibaehnlich");
  assert.equal(r.hits[0].distance, 1);
  assert.equal(r.hits[0].label, "Fendrix");
});

test("enthalten: fendrix-cloud", () => {
  const r = compareWithBrands("fendrix-cloud", index);
  assert.equal(r.hits[0].kind, "enthalten");
  assert.equal(r.hits[0].label, "Fendrix");
  assert.match(r.note ?? "", /Enthält die Marke „Fendrix“/);
});

test("enthalten: Präfix und Suffix an der Wortgrenze", () => {
  assert.equal(compareWithBrands("fendrixcloud", index).hits[0]?.kind, "enthalten");
  assert.equal(compareWithBrands("my-fendrix", index).hits[0]?.kind, "enthalten");
});

test("Gegenprobe: superfendrixo trifft nicht (mitten im Wort)", () => {
  const r = compareWithBrands("superfendrixo", index);
  assert.equal(r.total, 0);
  assert.deepEqual(r.hits, []);
  assert.equal(r.note, undefined);
});

test("Gegenprobe: fendr trifft nicht (Levenshtein 2 bei Länge 5)", () => {
  assert.equal(levenshtein("fendr", "fendrix"), 2);
  assert.equal(compareWithBrands("fendr", index).total, 0);
});

test("Gegenprobe: Kölner gleich, aber Levenshtein 3, trifft nicht", () => {
  const name = "feandorixa";
  assert.equal(koelnerPhonetik(name), koelnerPhonetik("fendrix"));
  assert.equal(levenshtein(name, "fendrix"), 3);
  assert.equal(compareWithBrands(name, index).total, 0);
});

test("Gegenprobe: Code unter 4 Stellen, kein Klangtreffer", () => {
  const small = buildBrandIndex([["bolu", "Bolu", ["Q1"]]]);
  assert.equal(koelnerPhonetik("balo"), koelnerPhonetik("bolu"));
  assert.ok(koelnerPhonetik("bolu").length < 4);
  assert.ok(levenshtein("balo", "bolu") <= 2);
  assert.equal(compareWithBrands("balo", small).total, 0);
});

test("unter 4 Zeichen nur Gleichheit: fen trifft Fen, fem nicht", () => {
  const small = buildBrandIndex([["fen", "Fen", ["Q1"]]]);
  assert.equal(compareWithBrands("fen", small).hits[0].kind, "gleich");
  assert.equal(compareWithBrands("fem", small).total, 0);
});

test("unter 4 Zeichen: auch bei langem Kölner-Code kein Klangtreffer", () => {
  assert.ok(koelnerPhonetik("xxx").length >= 4);
  assert.equal(koelnerPhonetik("xxx"), koelnerPhonetik("xxxy"));
  // kurze Marke, längerer Name
  assert.equal(compareWithBrands("xxxy", buildBrandIndex([["xxx", "Xxx", ["Q1"]]])).total, 0);
  // kurzer Name, längere Marke
  assert.equal(compareWithBrands("xxx", buildBrandIndex([["xxxy", "Xxxy", ["Q1"]]])).total, 0);
});

test("Kölner-Code unter 4 Stellen bei langen Namen: nur schreibähnlich, nie klanggleich", () => {
  assert.equal(koelnerPhonetik("ahaha"), koelnerPhonetik("ahoha"));
  assert.ok(koelnerPhonetik("ahaha").length < 4);
  const r = compareWithBrands("ahaha", buildBrandIndex([["ahoha", "Ahoha", ["Q1"]]]));
  assert.equal(r.hits[0].kind, "schreibaehnlich");
});

test("ein Treffer je Wikidata-ID, bester Rang gewinnt", () => {
  const idx = buildBrandIndex([
    ["fendrix", "Fendrix", ["Q7"]],
    ["phendrix", "Phendrix", ["Q7", "Q8"]],
  ]);
  const r = compareWithBrands("fendrix", idx);
  assert.equal(r.total, 2);
  const q7 = r.hits.filter((h) => h.id === "Q7");
  assert.equal(q7.length, 1);
  assert.equal(q7[0].kind, "gleich");
  assert.equal(r.hits.find((h) => h.id === "Q8")?.kind, "klanggleich");
});

test("ein Treffer je Wikidata-ID: bei gleichem Rang gewinnt die kleinere Distanz, auch wenn sie später kommt", () => {
  const idx = buildBrandIndex([
    ["phendrix", "Phendrix", ["Q9"]],
    ["fendrixe", "Fendrixe", ["Q9"]],
  ]);
  const r = compareWithBrands("fendrix", idx);
  assert.equal(r.total, 1);
  assert.equal(r.hits[0].kind, "klanggleich");
  assert.equal(r.hits[0].key, "fendrixe");
  assert.equal(r.hits[0].distance, 1);
});

test("höchstens 5 Treffer im Beleg, dazu „N weitere“", () => {
  const ids = Array.from({ length: 7 }, (_, i) => `Q${100 + i}`);
  const r = compareWithBrands("fendrix", buildBrandIndex([["fendrix", "Fendrix", ids]]));
  assert.equal(r.total, 7);
  assert.equal((r.evidence ?? "").match(/Levenshtein/g)?.length, 5);
  assert.match(r.evidence ?? "", /; 2 weitere$/);
  const few = compareWithBrands("fendrix", buildBrandIndex([["fendrix", "Fendrix", ids.slice(0, 5)]]));
  assert.doesNotMatch(few.evidence ?? "", /weitere/);
});

test("ab 20 Treffern Hinweis auf Gattungswort", () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => `Q${1000 + i}`);
  const many = compareWithBrands("fendrix", buildBrandIndex([["fendrix", "Fendrix", mk(20)]]));
  assert.equal(many.total, 20);
  assert.match(many.note ?? "", /möglicherweise ein Gattungswort/);
  const fewer = compareWithBrands("fendrix", buildBrandIndex([["fendrix", "Fendrix", mk(19)]]));
  assert.doesNotMatch(fewer.note ?? "", /Gattungswort/);
});

test("Reihenfolge stabil: unabhängig von der Eingabereihenfolge, nach Rang sortiert", () => {
  const marken: BrandEntry[] = [
    ["fendrix", "Fendrix", ["Q1"]],
    ["fendrik", "Fendrik", ["Q2"]],
    ["phendrix", "Phendrix", ["Q3"]],
    ["fendrixx", "Fendrixx", ["Q4"]],
  ];
  const a = compareWithBrands("fendrix", buildBrandIndex(marken));
  const b = compareWithBrands("fendrix", buildBrandIndex([...marken].reverse()));
  assert.deepEqual(a, b);
  assert.deepEqual(
    a.hits.map((h) => h.rank),
    [...a.hits.map((h) => h.rank)].sort((x, y) => x - y),
  );
  assert.equal(a.hits[0].id, "Q1");
});

test("zu kurzer Name und leere Liste: kein Treffer, kein Absturz", () => {
  assert.equal(compareWithBrands("a", index).total, 0);
  assert.equal(compareWithBrands("fendrix", buildBrandIndex([])).total, 0);
});
