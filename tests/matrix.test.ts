import { test } from "node:test";
import assert from "node:assert/strict";
import type { NameReport } from "@/lib/engine/check";
import type { Namespace, SourceResult, Status } from "@/lib/engine/types";
import { matrixCell, matrixColumns } from "@/lib/matrix";

function res(label: string, status: Status, namespace: Namespace = "domains", weak?: boolean): SourceResult {
  return { sourceId: label, namespace, label, target: label, status, ...(weak ? { weak } : {}) };
}

test("matrixCell: nichts abgefragt ergibt null", () => {
  assert.equal(matrixCell([res("npm", "taken", "packages")], "domains"), null);
  assert.equal(matrixCell([], "domains"), null);
});

test("matrixCell: alles nicht gefunden heißt „nichts gefunden“, nie „frei“", () => {
  const cell = matrixCell([res(".de", "not_found"), res(".com", "not_found")], "domains");
  assert.deepEqual(cell, { text: "nichts gefunden", tone: "ok" });
  assert.ok(!/frei/.test(cell?.text ?? ""));
});

test("matrixCell: vergeben nennt die Quellen, höchstens drei, der Rest als Zähler", () => {
  assert.deepEqual(matrixCell([res(".de", "taken"), res(".com", "taken"), res(".io", "not_found")], "domains"), {
    text: "vergeben: .de, .com",
    tone: "bad",
  });
  const many = ["a", "b", "c", "d", "e"].map((l) => res(l, "taken"));
  assert.equal(matrixCell(many, "domains")?.text, "vergeben: a, b, c +2");
});

test("matrixCell: nicht zulässig ist ebenfalls Warnung mit Text", () => {
  assert.deepEqual(matrixCell([res("Play", "invalid", "stores"), res("App Store", "not_found", "stores")], "stores"), {
    text: "nicht zulässig: Play",
    tone: "bad",
  });
});

test("matrixCell: schwache Treffer und ähnliche Namen sind gelb, nicht rot", () => {
  assert.deepEqual(matrixCell([res("Wikipedia", "taken", "known_names", true)], "known_names"), {
    text: "ähnlich: Wikipedia",
    tone: "warn",
  });
  assert.deepEqual(matrixCell([res("npm", "similar", "packages"), res("PyPI", "not_found", "packages")], "packages"), {
    text: "ähnlich: npm",
    tone: "warn",
  });
});

test("matrixCell: ohne Antwort ist neutral und nie grün", () => {
  assert.deepEqual(matrixCell([res(".de", "unknown"), res(".com", "unknown")], "domains"), {
    text: "ohne Antwort",
    tone: "unknown",
  });
  assert.deepEqual(matrixCell([res(".de", "unknown"), res(".com", "not_found")], "domains"), {
    text: "1 ohne Antwort",
    tone: "unknown",
  });
});

test("matrixCell: gemischte Zellen nehmen die schwerste Stufe", () => {
  assert.deepEqual(matrixCell([res(".de", "taken"), res(".com", "unknown"), res(".io", "similar")], "domains"), {
    text: "vergeben: .de · ähnlich: .io · 1 ohne Antwort",
    tone: "bad",
  });
});

test("matrixColumns: nur abgefragte Namensräume, in fester Reihenfolge", () => {
  const reports = [
    { results: [res("npm", "not_found", "packages"), res(".de", "not_found")] },
    { results: [res("Bluesky", "not_found", "social"), res("Wikidata", "not_found", "known_names")] },
  ] as unknown as NameReport[];
  assert.deepEqual(matrixColumns(reports), ["domains", "packages", "social", "known_names"]);
  assert.deepEqual(matrixColumns([]), []);
});
