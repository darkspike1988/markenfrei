import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CheckContext, SourceResult } from "@/lib/engine/types";
import { STATIC_SOURCES } from "@/lib/engine/check";
import { DEFAULT_NAMESPACES } from "@/lib/engine/check";
import { computeVerdict } from "@/lib/engine/verdict";
import {
  createWikidataBrandsSource,
  loadSnapshotFile,
  wikidataBrands,
  type LoadedBrands,
} from "@/lib/engine/sources/wikidata-brands";
import type { BrandEntry } from "@/lib/brand-similarity";

const mini = JSON.parse(readFileSync(new URL("./fixtures/brands-mini.json", import.meta.url), "utf8")) as {
  abgerufen: string;
  marken: BrandEntry[];
};
const MINI: LoadedBrands = { marken: mini.marken, abgerufen: mini.abgerufen };

/** Kontext, der bei jeder Netzanfrage fehlschlägt und sie zählt. */
function noNetCtx() {
  const calls: string[] = [];
  const ctx: CheckContext = {
    contact: "",
    http: {
      async request(url) {
        calls.push(url);
        throw new Error("Netz verboten");
      },
    },
  };
  return { ctx, calls };
}

const withMini = () => createWikidataBrandsSource({ load: () => MINI, minEntries: 12 });
const run = (s: ReturnType<typeof withMini>, name: string) => s.check(name, noNetCtx().ctx);

const NAMES = ["aquorin", "aquorinn", "aqvorin", "xaquorin-app", "tomorin", "zzzzqq", "ab", "aqu", "lunabar", "bexalt", "brausol-shop", "q-x"];

test("meldet nie taken (alle Testnamen, Fixture und echte Datei)", async () => {
  for (const s of [withMini(), wikidataBrands]) {
    for (const n of [...NAMES, "doritos", "google", "nike", "apple", "coca-cola"]) {
      assert.notEqual((await run(s, n)).status, "taken", n);
    }
  }
});

test("Treffer ergibt similar mit TMview-Link und Beleg, Ampel gelb", async () => {
  const r = await run(withMini(), "aquorin");
  assert.equal(r.status, "similar");
  assert.equal(r.namespace, "known_names");
  assert.match(r.url ?? "", /^https:\/\/www\.tmdn\.org\/tmview\/.*basicSearch=Aquorin/);
  assert.match(r.evidence ?? "", /Q900001/);
  assert.match(r.evidence ?? "", /Kölner/);
  assert.match(r.evidence ?? "", /Levenshtein/);
  assert.equal(computeVerdict([r]), "yellow");
  // Auch Klang- und Schreibähnlichkeit und Enthaltensein bleiben similar.
  for (const n of ["aqvorin", "aquorinn", "xaquorin-app"]) assert.equal((await run(withMini(), n)).status, "similar", n);
});

test("kein Treffer ergibt not_found, Text nennt Anzahl, Stand, Unvollständigkeit und keine Freigabe", async () => {
  const r = await run(withMini(), "zzzzqq");
  assert.equal(r.status, "not_found");
  assert.match(r.note ?? "", /Kein ähnlicher Eintrag unter 12 Marken aus Wikidata \(Stand 2000-01-01\)/);
  assert.match(r.note ?? "", /unvollständig/);
  assert.match(r.note ?? "", /Viele bekannte Marken sind dort nicht als Marke geführt/);
  assert.match(r.note ?? "", /keine Freigabe/);
  assert.match(r.note ?? "", /Kein Markenregister/);
});

test("unter 4 Zeichen: nur Gleichheit, und der Text sagt es", async () => {
  const s = createWikidataBrandsSource({
    load: () => ({ marken: [...mini.marken, ["abc", "Abc", ["Q900099"]]], abgerufen: "2000-01-01" }),
    minEntries: 12,
  });
  const none = await run(s, "abd");
  assert.equal(none.status, "not_found");
  assert.match(none.note ?? "", /nur auf Gleichheit geprüft \(unter 4 Zeichen\)/i);
  const same = await run(s, "abc");
  assert.equal(same.status, "similar");
  assert.match(same.note ?? "", /nur auf Gleichheit geprüft \(unter 4 Zeichen\)/);
});

test("Schnappschuss fehlt, leer, zu klein oder ohne Stand ergibt unknown, nie not_found", async () => {
  const cases: Array<[string, () => LoadedBrands | null]> = [
    ["null", () => null],
    ["leer", () => ({ marken: [], abgerufen: "2026-01-01" })],
    ["zu klein", () => MINI], // 12 < Standard-Untergrenze 1000
    ["kein Stand", () => ({ marken: mini.marken, abgerufen: "" })],
    ["kein Array", () => ({ marken: "x" as unknown as BrandEntry[], abgerufen: "2026-01-01" })],
    [
      "wirft",
      () => {
        throw new Error("kaputt");
      },
    ],
  ];
  for (const [label, load] of cases) {
    const s = createWikidataBrandsSource({ load });
    for (const n of ["aquorin", "zzzzqq"]) {
      const r = await run(s, n);
      assert.equal(r.status, "unknown", `${label}/${n}`);
      assert.equal(r.note, "Schnappschuss nicht verfügbar, nicht geprüft", label);
    }
  }
});

test("kaputter echter Kopf ergibt einen Fehler (nicht not_found)", () => {
  const real = JSON.parse(
    readFileSync(new URL("../src/lib/engine/sources/wikidata-brands.json", import.meta.url), "utf8"),
  );
  assert.ok(loadSnapshotFile(real).marken.length >= 1000);
  assert.throws(() => loadSnapshotFile({ ...real, lizenz: "" }));
  assert.throws(() => loadSnapshotFile({ ...real, abgerufen: "gestern" }));
  assert.throws(() => loadSnapshotFile({ ...real, anzahl: real.anzahl + 1 }));
  assert.throws(() => loadSnapshotFile({ ...real, marken: real.marken.slice(0, 500), anzahl: 500 }));
});

test("Fehler im Vergleich ergibt unknown", async () => {
  const bad = { marken: [...mini.marken, null as unknown as BrandEntry], abgerufen: "2000-01-01" };
  const r = await run(createWikidataBrandsSource({ load: () => bad, minEntries: 12 }), "aquorin");
  assert.equal(r.status, "unknown");
  assert.match(r.note ?? "", /nicht verfügbar|nicht geprüft/);
});

test("ungültiger Name ergibt invalid", async () => {
  for (const n of ["Aquorin", "a", "-abc", "ab c", "", "ü-x"]) assert.equal((await run(withMini(), n)).status, "invalid", n);
});

test("keine Netzanfrage", async () => {
  const { ctx, calls } = noNetCtx();
  const s = withMini();
  for (const n of ["aquorin", "zzzzqq", "ab"]) await s.check(n, ctx);
  await wikidataBrands.check("doritos", ctx);
  assert.deepEqual(calls, []);
});

test("echte Datei: Doritos wird als gleich gefunden, gelb, mit Wikidata-ID", async () => {
  const r: SourceResult = await wikidataBrands.check("doritos", noNetCtx().ctx);
  assert.equal(r.status, "similar");
  assert.match(r.note ?? "", /Gleicht der Marke/);
  assert.match(r.evidence ?? "", /gleich Doritos \(Q\d+/);
  assert.match(r.note ?? "", /Stand \d{4}-\d{2}-\d{2}/);
});

test("echte Datei: Beschreibung nennt Stand und Anzahl aus dem Kopf", () => {
  const head = JSON.parse(readFileSync(new URL("../src/lib/engine/sources/wikidata-brands.json", import.meta.url), "utf8"));
  assert.ok(wikidataBrands.description.includes(`Stand ${head.abgerufen}`));
  assert.ok(wikidataBrands.description.includes(String(head.anzahl).replace(/\B(?=(\d{3})+(?!\d))/g, ".")));
});

test("defaultEnabled ist false, Registrierung vorhanden, Standardliste unverändert", () => {
  assert.equal(wikidataBrands.defaultEnabled, false);
  assert.equal(wikidataBrands.id, "wikidata_brands");
  assert.equal(wikidataBrands.namespace, "known_names");
  assert.ok(STATIC_SOURCES.includes(wikidataBrands));
  const defaults = STATIC_SOURCES.filter((s) => s.namespace === "known_names" && s.defaultEnabled).map((s) => s.id);
  assert.deepEqual(defaults.sort(), ["gleif", "known_brands", "wikidata"]);
  assert.ok((DEFAULT_NAMESPACES as readonly string[]).includes("known_names"));
});
