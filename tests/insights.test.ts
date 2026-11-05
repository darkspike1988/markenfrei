import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeName,
  buildShortlist,
  generateVariants,
  MAX_TYPOS,
  typoVariants,
  VARIANT_PREFIXES,
  VARIANT_SUFFIXES,
} from "@/lib/insights";
import { normalizeName } from "@/lib/name";
import { levenshtein } from "@/lib/phonetics";

const valid = (s: string) => {
  const r = normalizeName(s);
  return r.ok && r.name === s;
};

test("analyzeName: Länge, Silben (geschätzt), Ziffern, Bindestriche, Doppelzeichen", () => {
  const a = analyzeName("Wachwerk");
  assert.equal(a.name, "wachwerk");
  assert.equal(a.length, 8);
  assert.equal(a.syllables, 2);
  assert.deepEqual(a.digits, []);
  assert.equal(a.hyphens, 0);
  assert.deepEqual(a.doubleLetters, []);
  const syl = a.facts.find((f) => f.label === "Silben");
  assert.match(syl?.value ?? "", /geschätzt/);

  const b = analyzeName("Ba11-oon-2x");
  assert.equal(b.name, "ba11-oon-2x");
  assert.deepEqual(b.digits, ["1", "1", "2"]);
  assert.equal(b.hyphens, 2);
  assert.deepEqual(b.doubleLetters, ["11", "oo"]);
  assert.equal(b.syllables, 2);
});

test("analyzeName normalisiert Umlaute wie die Prüfung", () => {
  const a = analyzeName("Müller");
  assert.equal(a.name, "mueller");
  assert.deepEqual(a.doubleLetters, ["ll"]);
});

test("analyzeName: ohne Vokal ist die Silbenzahl nicht schätzbar", () => {
  const a = analyzeName("n26");
  assert.equal(a.syllables, 0);
  assert.match(a.facts.find((f) => f.label === "Silben")!.value, /nicht schätzbar/);
});

test("analyzeName hat keinen Punktwert und keine Wertung", () => {
  const a = analyzeName("wachwerk") as Record<string, unknown>;
  for (const key of Object.keys(a)) assert.doesNotMatch(key, /score|rating|quality|punkte/i);
});

test("analyzeName ist deterministisch", () => {
  assert.deepEqual(analyzeName("schichtflux"), analyzeName("schichtflux"));
});

test("Hinweise zu Bindestrich nennen nur dokumentierte Regeln", () => {
  const a = analyzeName("my-app");
  assert.ok(a.registryNotes.some((n) => /Instagram, TikTok und X erlauben keinen Bindestrich/.test(n)));
  assert.ok(a.registryNotes.some((n) => /pub\.dev, Hex\.pm und CRAN/.test(n)));
  assert.ok(a.registryNotes.some((n) => /DPMA gleicht Trennzeichen aus/.test(n)));
  assert.ok(!a.registryNotes.some((n) => /doppelten Bindestrich/.test(n)));
  assert.ok(analyzeName("ab--cd").registryNotes.some((n) => /doppelten Bindestrich/.test(n)));
  assert.ok(analyzeName("ab--cd").registryNotes.some((n) => /xn--/.test(n)));
  assert.deepEqual(analyzeName("wachwerk").registryNotes, []);
});

test("Name mit Ziffer am Anfang und lange Namen bekommen ihre Hinweise", () => {
  assert.ok(analyzeName("3dwerk").registryNotes.some((n) => /Buchstaben am Anfang/.test(n)));
  const long = analyzeName("a".repeat(25));
  assert.ok(long.registryNotes.some((n) => /bsky\.social höchstens 18, JSR-Scopes höchstens 20/.test(n)));
  assert.ok(!long.registryNotes.some((n) => /GitHub/.test(n)));
});

test("Verwechselbares: genaue Paare und Gegenstücke", () => {
  const a = analyzeName("learn");
  const rn = a.confusables.find((c) => c.pair === "rn / m");
  assert.ok(rn);
  assert.deepEqual(rn.found, ["rn"]);
  assert.deepEqual(rn.lookalikes, ["leam"]);
  const l = analyzeName("hello").confusables.find((c) => c.pair === "l / I / 1");
  assert.deepEqual(l?.found, ["l"]);
  assert.deepEqual(l?.lookalikes, ["he1lo"]);
  const o = analyzeName("b0ot").confusables.find((c) => c.pair === "o / 0");
  assert.deepEqual(o?.found, ["o", "0"]);
  assert.deepEqual(o?.lookalikes, ["b00t", "boot"]);
  const w = analyzeName("avvo").confusables.find((c) => c.pair === "vv / w");
  assert.deepEqual(w?.lookalikes, ["awo"]);
  assert.deepEqual(analyzeName("wachtel").confusables.map((c) => c.pair), ["l / I / 1", "vv / w"]);
  assert.deepEqual(analyzeName("tec").confusables, []);
});

test("Tippfehler: höchstens 6, gültig, verschieden vom Namen, ohne Dubletten", () => {
  for (const n of ["wachwerk", "schichtflux", "planzeit", "ab", "my-app", "aab"]) {
    const t = typoVariants(n);
    assert.ok(t.length <= MAX_TYPOS, n);
    assert.equal(new Set(t.map((x) => x.name)).size, t.length, n);
    for (const v of t) {
      assert.notEqual(v.name, n);
      assert.ok(valid(v.name), `${n} -> ${v.name}`);
      assert.equal(v.distance, levenshtein(n, v.name));
    }
  }
});

test("Tippfehler: Arten sind erkennbar und gemischt", () => {
  const t = typoVariants("wachwerk");
  assert.equal(t.length, 6);
  assert.deepEqual(
    t.map((x) => x.kind),
    ["fehlend", "fehlend", "doppelt", "doppelt", "vertauscht", "vertauscht"],
  );
  for (const v of t) {
    if (v.kind === "fehlend") assert.equal(v.name.length, 7);
    if (v.kind === "doppelt") assert.equal(v.name.length, 9);
    if (v.kind === "vertauscht") assert.equal(v.name.length, 8);
    if (v.kind !== "vertauscht") assert.equal(v.distance, 1);
  }
  assert.ok(t.every((v) => v.label.length > 0));
});

test("Tippfehler: ein zu kurzer Name ergibt keine ungültigen Labels", () => {
  const t = typoVariants("ab");
  assert.ok(t.every((v) => v.name.length >= 2));
  assert.ok(t.some((v) => v.name === "ba"));
  assert.ok(t.some((v) => v.name === "aab"));
  assert.ok(!t.some((v) => v.name === "a"));
});

test("Tippfehler beim Bindestrich ergeben kein ungültiges Label", () => {
  for (const v of typoVariants("ab-cd")) assert.ok(valid(v.name), v.name);
  assert.ok(typoVariants("ab-cd").every((v) => !v.name.startsWith("-") && !v.name.endsWith("-")));
});

test("Markenähnlichkeit nutzt die vorhandene Liste", () => {
  const same = analyzeName("klarna");
  assert.equal(same.brands[0].kind, "identisch");
  assert.match(same.brands[0].text, /identisch mit klarna/);
  const sound = analyzeName("clarna");
  assert.equal(sound.brands[0].kind, "klanggleich");
  assert.match(sound.brands[0].text, /klingt ähnlich wie klarna/);
  const contains = analyzeName("my-spotify-tool");
  assert.ok(contains.brands.some((b) => b.kind === "enthalten" && b.text === "enthält spotify"));
  const none = analyzeName("wachwerk");
  assert.deepEqual(none.brands, []);
  assert.equal(none.brandTotal, 0);
  assert.ok(none.brandListSize > 50);
});

test("Kandidaten für die Variantenprüfung: gültig, ohne Dubletten, ohne den Namen", () => {
  const a = analyzeName("learn");
  assert.ok(a.variantCandidates.length > 0);
  assert.equal(new Set(a.variantCandidates).size, a.variantCandidates.length);
  assert.ok(!a.variantCandidates.includes("learn"));
  assert.ok(a.variantCandidates.includes("leam"));
  assert.ok(a.variantCandidates.every(valid));
  // Abstand 1 vor Vertauschungen
  const dist = a.variantCandidates.slice(0, a.typos.length).map((v) => levenshtein("learn", v));
  assert.deepEqual([...dist].sort((x, y) => x - y), dist);
});

// ---------------------------------------------------------------------------

test("generateVariants: ohne Auswahl keine Kandidaten", () => {
  assert.deepEqual(generateVariants("wachwerk"), []);
  assert.deepEqual(generateVariants("wachwerk", {}), []);
});

test("generateVariants: Präfixe und Suffixe, nur feste Muster", () => {
  const v = generateVariants("wachwerk", { prefixes: ["get", "evil"], suffixes: ["app", "x"] });
  assert.deepEqual(
    v.map((x) => x.name),
    ["getwachwerk", "wachwerkapp"],
  );
  assert.deepEqual(
    v.map((x) => x.kind),
    ["praefix", "suffix"],
  );
  const all = generateVariants("wachwerk", { prefixes: VARIANT_PREFIXES, suffixes: VARIANT_SUFFIXES });
  assert.equal(all.length, VARIANT_PREFIXES.length + VARIANT_SUFFIXES.length);
});

test("generateVariants: Bindestrich aus zwei Wörtern, beide Schreibweisen ohne die Eingabe", () => {
  assert.deepEqual(
    generateVariants("wach werk", { hyphen: true }).map((x) => x.name),
    ["wach-werk"],
  );
  assert.deepEqual(
    generateVariants("wach-werk", { hyphen: true }).map((x) => x.name),
    ["wachwerk"],
  );
  assert.deepEqual(generateVariants("wachwerk", { hyphen: true }), []);
  assert.deepEqual(
    generateVariants("Wach_Werk", { hyphen: true }).map((x) => x.name),
    ["wach-werk"],
  );
});

test("generateVariants: Bindestrich ergänzt auch Präfix- und Suffixformen", () => {
  const v = generateVariants("wachwerk", { prefixes: ["get"], suffixes: ["hq"], hyphen: true }).map((x) => x.name);
  assert.deepEqual(v, ["getwachwerk", "get-wachwerk", "wachwerkhq", "wachwerk-hq"]);
});

test("generateVariants: Plural und Singular", () => {
  assert.deepEqual(
    generateVariants("wachwerk", { plural: true }).map((x) => x.name),
    ["wachwerks"],
  );
  assert.deepEqual(
    generateVariants("wachwerks", { plural: true }).map((x) => x.name),
    ["wachwerk"],
  );
  assert.deepEqual(generateVariants("as", { plural: true }), []);
});

test("generateVariants: keine Dubletten, nie der Grundname, alle Labels gültig", () => {
  const v = generateVariants("get app", {
    prefixes: VARIANT_PREFIXES,
    suffixes: VARIANT_SUFFIXES,
    hyphen: true,
    plural: true,
  });
  const names = v.map((x) => x.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(!names.includes("getapp"));
  assert.ok(!names.includes("getgetapp"));
  assert.ok(!names.includes("getappapp"));
  assert.ok(names.includes("get-app"));
  assert.ok(names.every(valid));
});

test("generateVariants: Grenzen, ungültige Eingabe und zu lange Namen", () => {
  assert.deepEqual(generateVariants("", { prefixes: ["get"] }), []);
  assert.deepEqual(generateVariants("a", { prefixes: ["get"] }), []);
  assert.equal(generateVariants("wachwerk", { prefixes: VARIANT_PREFIXES, suffixes: VARIANT_SUFFIXES, max: 3 }).length, 3);
  assert.deepEqual(generateVariants("wachwerk", { prefixes: ["get"], max: 0 }), []);
  // 62 Zeichen plus Präfix wären zu lang
  assert.deepEqual(generateVariants("a".repeat(62), { prefixes: ["get"] }), []);
  // Endung wird wie bei der Prüfung abgetrennt
  assert.deepEqual(
    generateVariants("wachwerk.de", { suffixes: ["app"], hyphen: true }).map((x) => x.name),
    ["wachwerkapp", "wachwerk-app"],
  );
});

test("generateVariants ist deterministisch", () => {
  const o = { prefixes: ["my", "the"], suffixes: ["io"], hyphen: true, plural: true } as const;
  assert.deepEqual(generateVariants("wach werk", o), generateVariants("wach werk", o));
});

test("buildShortlist: Original zuerst, Grenze, Dubletten, Zählung der abgeschnittenen", () => {
  const r = buildShortlist("a1", ["b1", "a1", "b1", "c1"], 10);
  assert.deepEqual(r, { names: ["a1", "b1", "c1"], dropped: 0 });
  const cut = buildShortlist("o1", ["a1", "b1", "c1", "d1"], 3);
  assert.deepEqual(cut, { names: ["o1", "a1", "b1"], dropped: 2 });
  assert.deepEqual(buildShortlist("o1", [], 10), { names: ["o1"], dropped: 0 });
});
