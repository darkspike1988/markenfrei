import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import {
  MAX_SNAPSHOT_BYTES,
  brandKey,
  buildCandidates,
  dedupe,
  describeFilter,
  stripLegalForm,
  isLatinLabel,
  passesFilter,
  serializeSnapshot,
  validateSnapshotText,
  type Snapshot,
} from "@/lib/engine/sources/wikidata-brands-format";

const FIXTURE = new URL("./fixtures/brands-snapshot-mini.json", import.meta.url);
const REAL = new URL("../src/lib/engine/sources/wikidata-brands.json", import.meta.url);
const fixtureText = readFileSync(FIXTURE, "utf8");
const fixture = JSON.parse(fixtureText) as Snapshot;

/** Ersetzt ein Stück im Fixture-Text und liefert die Fehler der Prüfung. */
const errorsAfter = (from: string, to: string, minEntries = 12) => {
  assert.ok(fixtureText.includes(from), `Fixture enthält "${from}" nicht`);
  return validateSnapshotText(fixtureText.replace(from, to), { minEntries });
};

test("Fixture: Kopf, anzahl, Sortierung und Schlüssel sind in Ordnung", () => {
  assert.deepEqual(validateSnapshotText(fixtureText, { minEntries: 12 }), []);
  assert.ok(fixture.lizenz.includes("CC0"));
  assert.match(fixture.abgerufen, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(fixture.anzahl, fixture.marken.length);
  assert.ok(fixture.marken.length >= 12);
  const keys = fixture.marken.map((m) => m[0]);
  assert.deepEqual([...keys].sort(), keys);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.match(k, /^[a-z0-9]{3,30}$/);
  assert.ok(Buffer.byteLength(fixtureText) <= MAX_SNAPSHOT_BYTES);
});

test("Fixture: Serialisierung ist rund (Parse und erneutes Schreiben ergeben denselben Text)", () => {
  assert.equal(serializeSnapshot(fixture), fixtureText);
});

test("Prüfung erkennt Verstöße", () => {
  assert.match(errorsAfter('"CC0 1.0, Wikidata"', '"MIT"').join("|"), /CC0/);
  assert.match(errorsAfter("2026-11-07", "2026-13-45").join("|"), /ISO-Datum/);
  assert.match(errorsAfter("2026-11-07", "07.11.2026").join("|"), /ISO-Datum/);
  assert.match(errorsAfter('"anzahl": 14', '"anzahl": 15').join("|"), /anzahl/);
  assert.match(errorsAfter('"abfrage_sha256": "0', '"abfrage_sha256": "g').join("|"), /sha256/);
  // Sortierung: zwei Zeilen tauschen
  const a = '["aurelion","Aurelion",["Q9000001"]],\n';
  const b = '["brausoelwerke","Brausöl Werke",["Q9000010"]],\n';
  assert.match(errorsAfter(a + b, b + a).join("|"), /sortiert/);
  // doppelter Schlüssel
  assert.match(errorsAfter('["calvento","Calvento"', '["cafedelmar","Calvento"').join("|"), /sortiert|doppelt|passt nicht/);
  // Schlüssel passt nicht auf das Muster
  assert.match(errorsAfter('["glimmo"', '["Gl-immo"').join("|"), /Schlüssel/);
  // mehr als 3 IDs
  assert.match(errorsAfter('["Q9000005","Q9000006","Q9000007"]', '["Q9000005","Q9000006","Q9000007","Q9000018"]').join("|"), /IDs/);
  // Untergrenze
  assert.match(validateSnapshotText(fixtureText, { minEntries: 1000 }).join("|"), /Zu wenige/);
  // Größe
  assert.match(validateSnapshotText(fixtureText, { maxBytes: 100 }).join("|"), /zu groß/);
  // Abweichende Textform (Leerraum)
  assert.match(validateSnapshotText(fixtureText.replace('"anzahl": 14', '"anzahl":  14')).join("|"), /Textform/);
  assert.ok(validateSnapshotText("kein json").length > 0);
});

test("Schlüsselbildung: foldToAscii, klein, nur [a-z0-9]", () => {
  assert.equal(brandKey("Brausöl Werke"), "brausoelwerke");
  assert.equal(brandKey("Café del Mar"), "cafedelmar");
  assert.equal(brandKey("Lunabar!"), "lunabar");
  assert.equal(brandKey("Fendrix-2"), "fendrix2");
});

test("Filter gegen Müll", () => {
  const ok = { id: "Q9000001", label: "Fendrix", sitelinks: 2 };
  assert.equal(passesFilter(ok, 1), true);
  assert.equal(passesFilter({ ...ok, label: "Ab" }, 0), false, "zu kurz");
  assert.equal(passesFilter({ ...ok, label: "A".repeat(31) }, 0), false, "zu lang");
  assert.equal(passesFilter({ ...ok, label: "Fe Br To Lu Ma" }, 0), false, "5 Wörter bei kurzem Schlüssel");
  assert.equal(passesFilter({ ...ok, label: "Fe Br To Lu" }, 0), true, "4 Wörter, Schlüssel 8");
  assert.equal(passesFilter({ ...ok, label: "东京饮料" }, 0), false, "nicht lateinisch");
  assert.equal(passesFilter({ ...ok, label: "Фендрикс" }, 0), false, "kyrillisch");
  assert.equal(passesFilter({ ...ok, label: "Фендрикс Brausol" }, 0), false, "gemischt: Schlüssel allein wäre gültig");
  assert.equal(passesFilter({ ...ok, label: "东京 Brausol" }, 0), false, "gemischt mit Han");
  assert.equal(passesFilter({ ...ok, label: "12345" }, 0), false, "nur Ziffern");
  assert.equal(passesFilter({ ...ok, id: "Q123456", label: "Q123456" }, 0), false, "gleich der ID");
  assert.equal(passesFilter({ ...ok, sitelinks: 0 }, 1), false, "zu wenige Sitelinks");
  assert.equal(passesFilter({ ...ok, sitelinks: 2 }, 3), false);
  assert.equal(passesFilter({ ...ok, sitelinks: 0 }, 0), true);
  assert.equal(isLatinLabel("Brausöl"), true);
});

test("Deduplizierung: gleiche Schlüssel, höchstens 3 IDs, Label der meisten Sitelinks", () => {
  const out = dedupe([
    { id: "Q2", label: "FENDRIX", sitelinks: 1 },
    { id: "Q1", label: "Fendrix", sitelinks: 9 },
    { id: "Q3", label: "fendrix", sitelinks: 5 },
    { id: "Q4", label: "Fen-drix", sitelinks: 3 },
    { id: "Q1", label: "Fendrix", sitelinks: 9 },
    { id: "Q7", label: "Brausol", sitelinks: 0 },
  ]);
  assert.deepEqual(out, [
    ["brausol", "Brausol", ["Q7"]],
    ["fendrix", "Fendrix", ["Q1", "Q3", "Q4"]],
  ]);
});

test("Rechtsformen: nur am Ende (ausgedachte Namen)", () => {
  assert.equal(stripLegalForm("Fendrix Corporation"), "Fendrix");
  assert.equal(stripLegalForm("Tomorin GmbH"), "Tomorin");
  assert.equal(stripLegalForm("Calvento Inc."), "Calvento");
  assert.equal(stripLegalForm("Calvento, Inc."), "Calvento");
  assert.equal(stripLegalForm("Aurelion Co., Ltd."), "Aurelion");
  assert.equal(stripLegalForm("Glimmo S.p.A."), "Glimmo");
  assert.equal(stripLegalForm("Glimmo S.A."), "Glimmo");
  assert.equal(stripLegalForm("Lunabar N.V."), "Lunabar");
  assert.equal(stripLegalForm("Bexalt A/S"), "Bexalt");
  assert.equal(stripLegalForm("Bexalt e.V."), "Bexalt");
  assert.equal(stripLegalForm("Bexalt GmbH & Co. KG"), "Bexalt");
  assert.equal(stripLegalForm("Fendrix PLC"), "Fendrix");
  // Rechtsform nicht am Ende: bleibt
  assert.equal(stripLegalForm("Corporation Zero"), "Corporation Zero");
  assert.equal(stripLegalForm("Tomorin GmbH Nord"), "Tomorin GmbH Nord");
  // nichts übrig: unverändert; Teilwörter werden nicht angefasst
  assert.equal(stripLegalForm("GmbH"), "GmbH");
  assert.equal(stripLegalForm("Fendrixag"), "Fendrixag");
  assert.equal(stripLegalForm("Fendrix Companyx"), "Fendrix Companyx");
});

const row = (id: string, label: string, sitelinks: number, type: string) => ({ id, label, sitelinks, type });
const OPTS = { minSitelinks: 1, includeTrademark: false, includeCompanies: true, companyMinSitelinks: 20 };

test("Kandidaten: Rechtsformen nur bei Firmen, Schwelle je Art, Marken unverändert", () => {
  const rows = [
    row("Q1", "Fendrix Corporation", 30, "Q4830453"), // Firma, stark genug
    row("Q2", "Tomorin GmbH", 5, "Q891723"), // Firma, zu wenige Sitelinks
    row("Q3", "Calvento Inc", 3, "Q431289"), // Marke: Label bleibt
    row("Q4", "Corporation Zero", 25, "Q6881511"), // Rechtsform nicht am Ende
    row("Q5", "Aurelion", 2, "Q167270"), // reine Handelsmarke: aus
    row("Q6", "Lunabar AG", 40, "Q431289"), // Marke und Firma: gilt als Marke
    row("Q6", "Lunabar AG", 40, "Q4830453"),
  ];
  const out = buildCandidates(rows, OPTS);
  assert.deepEqual(
    out.map((c) => [c.id, c.label]),
    [["Q1", "Fendrix"], ["Q3", "Calvento Inc"], ["Q4", "Corporation Zero"], ["Q6", "Lunabar AG"]],
  );
  assert.deepEqual(dedupe(out).map((e) => e[0]), ["calventoinc", "corporationzero", "fendrix", "lunabarag"]);
  // Ohne includeCompanies: keine Firmen
  assert.deepEqual(buildCandidates(rows, { ...OPTS, includeCompanies: false }).map((c) => c.id), ["Q3", "Q6"]);
  // Firmen-Schwelle einstellbar
  assert.ok(buildCandidates(rows, { ...OPTS, companyMinSitelinks: 5 }).some((c) => c.label === "Tomorin"));
  // gleiche Filter wie bei Marken (Schlüssel zu kurz nach dem Entfernen)
  assert.deepEqual(buildCandidates([row("Q9", "Ab GmbH", 99, "Q4830453")], OPTS), []);
});

test("Dateikopf enthaelt: optional, geprüft, rund; Filtertext nennt es", () => {
  const withField = (e: unknown) => serializeSnapshot({ ...fixture, enthaelt: e as never });
  // Datei ohne Feld bleibt gültig
  assert.deepEqual(validateSnapshotText(fixtureText, { minEntries: 12 }), []);
  assert.equal(fixtureText.includes("enthaelt"), false);
  for (const e of [["marken"], ["marken", "firmen"]]) {
    const t = withField(e);
    assert.deepEqual(validateSnapshotText(t, { minEntries: 12 }), []);
    assert.equal(serializeSnapshot(JSON.parse(t)), t);
  }
  for (const e of [["firmen"], [], ["marken", "marken"], ["marken", "x"], "marken", 1]) {
    assert.match(validateSnapshotText(withField(e), { minEntries: 12 }).join("|"), /enthaelt/, JSON.stringify(e));
  }
  assert.match(describeFilter(OPTS), /enthält Marken und Firmen/);
  assert.match(describeFilter(OPTS), /Q4830453, Q891723, Q6881511; Sitelinks >= 20; Rechtsformen am Ende entfernt/);
  assert.match(describeFilter({ ...OPTS, includeCompanies: false }), /enthält Marken$/);
  assert.doesNotMatch(describeFilter({ ...OPTS, includeCompanies: false }), /Firmen/);
});

// Die echte Datei wird später von Hand erzeugt. Tests setzen sie nicht voraus: Fehlt sie, wird übersprungen
// (sichtbar als "skipped"), liegt sie vor, gelten Format, 600-KB-Grenze und Untergrenze (offen, vorläufig 1000).
test("echter Schnappschuss (nur wenn vorhanden)", { skip: !existsSync(REAL) && "wikidata-brands.json noch nicht erzeugt" }, () => {
  assert.ok(statSync(REAL).size <= MAX_SNAPSHOT_BYTES, "größer als 600 KB");
  assert.deepEqual(validateSnapshotText(readFileSync(REAL, "utf8"), { minEntries: 1000 }), []);
});
