import { test } from "node:test";
import assert from "node:assert/strict";
import type { SourceResult, Status } from "@/lib/engine/types";
import { rankReports } from "@/lib/engine/verdict";
import { groupOptional, selectionSummary, type SourceInfo } from "@/components/checker-config";
import { groupNotes, hiddenNoteLead, shortlistSummary } from "@/components/verdict-text";

function res(label: string, status: Status, note?: string): SourceResult {
  return { sourceId: label, namespace: "domains", label, target: label, status, ...(note ? { note } : {}) };
}

test("selectionSummary nennt Namensräume, Endungen und Zusatzquellen in einer Zeile", () => {
  const config = {
    namespaces: [
      { id: "domains" as const, label: "Domains" },
      { id: "packages" as const, label: "Pakete" },
    ],
  };
  assert.equal(
    selectionSummary({ namespaces: ["domains", "packages"], tlds: ["de", "com"], extra: [] }, config),
    "Domains, Pakete · .de .com",
  );
  assert.equal(
    selectionSummary({ namespaces: ["packages"], tlds: ["de"], extra: ["nuget", "pypi"] }, config),
    "Pakete · +2 weitere Quellen",
  );
  assert.equal(selectionSummary({ namespaces: [], tlds: [], extra: ["nuget"] }, config), "+1 weitere Quelle");
  assert.equal(selectionSummary({ namespaces: [], tlds: [], extra: [] }, config), "Keine Quelle gewählt");
});

test("groupOptional gruppiert nur wählbare Quellen und folgt der Reihenfolge der Namensräume", () => {
  const src = (id: string, namespace: SourceInfo["namespace"], defaultEnabled = false): SourceInfo => ({
    id,
    label: id,
    namespace,
    description: "",
    defaultEnabled,
  });
  const groups = groupOptional([
    src("wikipedia", "known_names"),
    src("npm", "packages", true),
    src("nuget", "packages"),
    src("pypi", "packages"),
    src("github", "social"),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.ns, g.list.map((s) => s.id)]),
    [
      ["packages", ["nuget", "pypi"]],
      ["social", ["github"]],
      ["known_names", ["wikipedia"]],
    ],
  );
});

test("shortlistSummary kürzt lange Listen und behält die Statusunterscheidung", () => {
  const results = [".de", ".com", ".dev", ".app", ".io", ".net"].map((l) => res(l, "taken"));
  const [entry] = rankReports([{ name: "x", verdict: "red", results }]);
  assert.equal(shortlistSummary(entry), "vergeben: .de, .com, .dev, .app +2");
});

test("groupNotes blendet Hinweise zu „nicht gefunden“ aus, verliert aber keinen", () => {
  const rows = [
    res(".de", "not_found", "Bei der Registry nicht registriert."),
    res(".com", "not_found", "Bei der Registry nicht registriert."),
    res(".dev", "taken", "Bei der Registry registriert."),
    res(".app", "taken", "Bei der Registry registriert."),
    res(".io", "unknown", "RDAP ohne Antwort."),
  ];
  const n = groupNotes(rows);
  assert.deepEqual(n.shared, [{ status: "taken", note: "Bei der Registry registriert." }]);
  assert.deepEqual([...n.inline], [[".io", "RDAP ohne Antwort."]]);
  assert.deepEqual(n.hidden, [{ labels: [".de", ".com"], note: "Bei der Registry nicht registriert." }]);
  assert.equal(hiddenNoteLead(n.hidden[0], n.hidden.length), "Alle");

  const mixed = groupNotes([res("npm", "not_found", "a"), res("PyPI", "not_found", "b")]);
  assert.equal(hiddenNoteLead(mixed.hidden[0], mixed.hidden.length), "npm");
});
