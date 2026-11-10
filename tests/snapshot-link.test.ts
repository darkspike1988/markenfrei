import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  decodeShared,
  encodeShared,
  groupSharedRows,
  MAX_FRAGMENT_LENGTH,
  MAX_SHARED_NAMES,
  MAX_SHARED_ROWS,
  parseShared,
  sharedFromHash,
  sharedFromReports,
  sharedVerdict,
  snapshotLinkSupported,
  withSharedFragment,
  type SharedSnapshot,
} from "@/lib/snapshot-link";

const AT = "2026-11-10T09:30:00.000Z";

/** Ohne CompressionStream("deflate-raw") (Node vor 20.12) gibt es den Link nicht; dann entfallen diese Tests. */
const streams = { skip: snapshotLinkSupported() ? false : "CompressionStream(deflate-raw) fehlt" };

const SNAPSHOT: SharedSnapshot = {
  at: AT,
  names: [
    {
      name: "wachwerk",
      rows: [
        ["rdap:de", "not_found", false],
        ["rdap:com", "taken", false],
        ["npm", "not_found", false],
        ["known_brands", "taken", true],
        ["pypi", "unknown", false],
      ],
    },
    { name: "planzeit", rows: [["rdap:de", "similar", false]] },
  ],
};

/** Packt beliebiges JSON so, wie es ein manipulierter Link enthalten könnte. */
function pack(data: unknown): string {
  return deflateRawSync(Buffer.from(JSON.stringify(data))).toString("base64url");
}

const wire = (rows: unknown[]) => ({ v: 1, t: AT, n: [["wachwerk", rows]] });

test("sharedFromReports: Zeilen als [ID, Status, schwach], gekürzt auf die Obergrenzen", () => {
  const snapshot = sharedFromReports(
    [
      {
        name: "wachwerk",
        results: [
          { sourceId: "rdap:de", status: "not_found" },
          { sourceId: "known_brands", status: "taken", weak: true },
        ],
      },
    ],
    AT,
  );
  assert.deepEqual(snapshot, {
    at: AT,
    names: [{ name: "wachwerk", rows: [["rdap:de", "not_found", false], ["known_brands", "taken", true]] }],
  });
  const many = Array.from({ length: MAX_SHARED_NAMES + 3 }, (_, i) => ({
    name: `name${i}`,
    results: Array.from({ length: MAX_SHARED_ROWS + 3 }, (_, j) => ({ sourceId: `s${j}`, status: "not_found" as const })),
  }));
  const capped = sharedFromReports(many, AT);
  assert.equal(capped.names.length, MAX_SHARED_NAMES);
  assert.equal(capped.names[0].rows.length, MAX_SHARED_ROWS);
});

test("encodeShared/decodeShared: Hin und zurück ergibt denselben Stand, als base64url", streams, async () => {
  const data = await encodeShared(SNAPSHOT);
  assert.match(data, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeShared(data), SNAPSHOT);
});

test("encodeShared: der volle Stand (10 Namen, je 120 Quellen) passt in die Obergrenze des Fragments", streams, async () => {
  const full = sharedFromReports(
    Array.from({ length: MAX_SHARED_NAMES }, (_, i) => ({
      name: `langername-nummer-${i}`,
      results: Array.from({ length: MAX_SHARED_ROWS }, (_, j) => ({
        sourceId: j % 2 ? `rdap:tld${j}` : `quelle-${j}`,
        status: (["taken", "not_found", "similar", "invalid", "unknown"] as const)[(i + j) % 5],
        weak: j % 7 === 0,
      })),
    })),
    AT,
  );
  const data = await encodeShared(full);
  assert.ok(data.length <= MAX_FRAGMENT_LENGTH, `${data.length} Zeichen`);
  assert.deepEqual(await decodeShared(data), full);
});

test("decodeShared: veränderte, abgeschnittene und fremde Daten ergeben null", streams, async () => {
  const data = await encodeShared(SNAPSHOT);
  // Blocktyp 11 (reserviert) im ersten Byte: kein gültiger deflate-Strom mehr
  const bytes = Buffer.from(data, "base64url");
  bytes[0] |= 0b110;
  const tampered = bytes.toString("base64url");
  for (const bad of [
    "",
    tampered,
    data.slice(0, Math.floor(data.length / 2)),
    "nicht+base64/=",
    "%%%",
    pack({ v: 2, t: AT, n: [["wachwerk", [["npm", "taken", 0]]]] }),
    pack("nur ein Text"),
    Buffer.from("kein deflate").toString("base64url"),
  ]) {
    assert.equal(await decodeShared(bad), null, bad.slice(0, 40));
  }
});

test("decodeShared: zu lange Fragmente und zu große entpackte Daten ergeben null", streams, async () => {
  assert.equal(await decodeShared("A".repeat(MAX_FRAGMENT_LENGTH + 1)), null);
  // Klein gepackt, groß entpackt: eine lange Zeichenkette aus lauter gleichen Zeichen
  const bomb = deflateRawSync(Buffer.from(`{"v":1,"t":"${AT}","n":[["${"a".repeat(500_000)}",[]]]}`)).toString("base64url");
  assert.ok(bomb.length < MAX_FRAGMENT_LENGTH);
  assert.equal(await decodeShared(bomb), null);
  const rows = Array.from({ length: MAX_SHARED_ROWS + 1 }, (_, i) => [`s${i}`, "not_found", 0]);
  assert.equal(await decodeShared(pack(wire(rows))), null);
});

test("decodeShared: ein unbekannter Status macht den Stand ungültig", streams, async () => {
  assert.notEqual(await decodeShared(pack(wire([["npm", "taken", 0]]))), null);
  assert.equal(await decodeShared(pack(wire([["npm", "frei", 0]]))), null);
});

test("parseShared: prüft Version, Zeitpunkt, Größen, Status, Doppelte und Längen", () => {
  assert.deepEqual(parseShared(wire([["npm", "taken", 1]])), {
    at: AT,
    names: [{ name: "wachwerk", rows: [["npm", "taken", true]] }],
  });
  const names = (n: number) => Array.from({ length: n }, (_, i) => [`name${i}`, [["npm", "taken", 0]]]);
  assert.notEqual(parseShared({ v: 1, t: AT, n: names(MAX_SHARED_NAMES) }), null);
  for (const bad of [
    null,
    [],
    "text",
    { v: 2, t: AT, n: names(1) },
    { v: 1, t: "gestern", n: names(1) },
    { v: 1, n: names(1) },
    { v: 1, t: AT, n: [] },
    { v: 1, t: AT, n: names(MAX_SHARED_NAMES + 1) },
    { v: 1, t: AT, n: [["wachwerk", [["npm", "taken", 0]]], ["wachwerk", [["npm", "taken", 0]]]] },
    { v: 1, t: AT, n: [["x".repeat(101), [["npm", "taken", 0]]]] },
    { v: 1, t: AT, n: [["", [["npm", "taken", 0]]]] },
    wire([["npm", "frei", 0]]),
    wire([["npm", "taken", true]]),
    wire([["npm", "taken"]]),
    wire([["npm", "taken", 0, "mehr"]]),
    wire([["x".repeat(101), "taken", 0]]),
    wire([["npm", "taken", 0], ["npm", "not_found", 0]]),
    wire([[42, "taken", 0]]),
  ]) {
    assert.equal(parseShared(bad), null, JSON.stringify(bad)?.slice(0, 80));
  }
});

test("groupSharedRows: Domains als .tld, andere Quellen mit Beschriftung, unbekannte IDs zuletzt unter ihrer ID", () => {
  const sources = [
    { id: "npm", label: "npm", namespace: "packages" as const },
    { id: "known_brands", label: "Bekannte Marken", namespace: "known_names" as const },
  ];
  const groups = groupSharedRows(
    [
      ["unbekannt-x", "taken", false],
      ["known_brands", "taken", true],
      ["npm", "not_found", false],
      ["rdap:de", "not_found", false],
      ["dns:shop", "taken", false],
    ],
    sources,
  );
  assert.deepEqual(groups, [
    {
      ns: "domains",
      rows: [
        { id: "rdap:de", label: ".de", status: "not_found", weak: false },
        { id: "dns:shop", label: ".shop", status: "taken", weak: false },
      ],
    },
    { ns: "packages", rows: [{ id: "npm", label: "npm", status: "not_found", weak: false }] },
    { ns: "known_names", rows: [{ id: "known_brands", label: "Bekannte Marken", status: "taken", weak: true }] },
    { ns: null, rows: [{ id: "unbekannt-x", label: "unbekannt-x", status: "taken", weak: false }] },
  ]);
});

test("sharedVerdict: dieselbe Ampel wie im Bericht, schwache Treffer höchstens Gelb", () => {
  assert.equal(sharedVerdict([["npm", "not_found", false]]), "green");
  assert.equal(sharedVerdict([["npm", "not_found", false], ["known_brands", "taken", true]]), "yellow");
  assert.equal(sharedVerdict([["npm", "taken", false]]), "red");
  assert.equal(sharedVerdict([["npm", "unknown", false]]), "yellow");
});

test("sharedFromHash und withSharedFragment: nur #stand= zählt, ein altes Fragment wird ersetzt", () => {
  assert.equal(sharedFromHash("#stand=abc"), "abc");
  assert.equal(sharedFromHash("#bericht-wachwerk"), null);
  assert.equal(sharedFromHash(""), null);
  assert.equal(
    withSharedFragment("https://markenfrei.app/?q=wachwerk#bericht-wachwerk", "abc"),
    "https://markenfrei.app/?q=wachwerk#stand=abc",
  );
  assert.equal(withSharedFragment("https://markenfrei.app/?q=wachwerk", "abc"), "https://markenfrei.app/?q=wachwerk#stand=abc");
});
