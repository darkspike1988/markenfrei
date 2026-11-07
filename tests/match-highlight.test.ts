import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightMatch } from "@/lib/match-highlight";

const marked = (name: string, label: string) =>
  highlightMatch(name, label)
    .filter((s) => s.match)
    .map((s) => s.text)
    .join("|");
const text = (name: string, label: string) =>
  highlightMatch(name, label)
    .map((s) => s.text)
    .join("");

test("gleich: das ganze Label ist markiert", () => {
  assert.deepEqual(highlightMatch("wachwerk", "Wachwerk"), [{ text: "Wachwerk", match: true }]);
});

test("enthalten: Label im Namen, ganzes Label markiert", () => {
  assert.equal(marked("google-pilot", "Google"), "Google");
});

test("Präfix und Suffix bei unterschiedlicher Länge", () => {
  assert.equal(marked("spotfy", "Spotify"), "Spot|fy");
  assert.equal(marked("netflux", "Netflix"), "Netfl|x");
});

test("gleiche Länge: gleiche Zeichen an gleicher Position", () => {
  assert.deepEqual(
    highlightMatch("kaffe", "koffe").map((s) => [s.text, s.match]),
    [
      ["k", true],
      ["o", false],
      ["ffe", true],
    ],
  );
});

test("Text bleibt unverändert (Segmente ergeben das Label)", () => {
  assert.equal(text("xyzzy", "Müller-Bräu"), "Müller-Bräu");
  assert.equal(text("mueller", "Müller"), "Müller");
});

test("Umlaute: ü entspricht ue im normalisierten Namen", () => {
  assert.equal(marked("mueller", "Müller"), "Müller");
  assert.equal(marked("muellerei", "Müller"), "Müller");
});

test("ß entspricht ss", () => {
  assert.equal(marked("strasse", "Straße"), "Straße");
});

test("Bindestriche und Leerzeichen werden übersprungen, Trenner innen mit markiert", () => {
  assert.equal(marked("wach-werk", "Wach Werk"), "Wach Werk");
  assert.equal(marked("wachwerk", "Wach-Werk"), "Wach-Werk");
});

test("Trenner zwischen markiertem und nicht markiertem Text bleibt unmarkiert", () => {
  assert.equal(marked("coca-cala", "Coca-Cola"), "Coca-C|la");
  assert.equal(text("coca-cala", "Coca-Cola"), "Coca-Cola");
});

test("kein gemeinsames Zeichen: nichts markiert; leere Eingaben ohne Absturz", () => {
  assert.equal(marked("abc", "xyz"), "");
  assert.deepEqual(highlightMatch("abc", ""), []);
  assert.deepEqual(highlightMatch("", "Abc"), [{ text: "Abc", match: false }]);
});

test("Präfix und Suffix überlappen nicht", () => {
  // Präfix 3 deckt den ganzen Namen; der Suffix darf nichts doppelt zählen
  assert.equal(marked("aaa", "aaaa"), "aaa");
  assert.equal(marked("ab", "abab"), "ab");
});
