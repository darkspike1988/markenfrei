import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ClearanceInputError, performClearanceCheck } from "@/lib/clearance";

const realFetch = globalThis.fetch;
before(() => {
  // Alle Quellen fallen aus: der Test prüft nur Eingabe und Fehlerbehandlung.
  globalThis.fetch = (() => Promise.reject(new Error("offline"))) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
});

test("Umlaute werden ausgeschrieben, bevor geprüft wird", async () => {
  const r = await performClearanceCheck({ name: "Müller", tlds: ["de"] });
  assert.equal(r.name, "mueller");
  assert.equal(r.domains[0].domain, "mueller.de");
});

test("ungültiger Name wirft einen Eingabefehler", async () => {
  await assert.rejects(performClearanceCheck({ name: "-foo-" }), ClearanceInputError);
  await assert.rejects(performClearanceCheck({ name: "" }), ClearanceInputError);
});

test("ungültige Endung wirft einen Eingabefehler", async () => {
  await assert.rejects(
    performClearanceCheck({ name: "foo", tlds: ["constructor"] }),
    ClearanceInputError,
  );
});

test("fehlende Quellen machen die Prüfung unvollständig und deckeln den Score", async () => {
  const r = await performClearanceCheck({ name: "wachwerk", tlds: ["de", "com"] });
  assert.ok(r.incomplete.length > 0);
  assert.ok(r.matrixScore.totalScore <= 79, `Score ${r.matrixScore.totalScore}`);
  assert.notEqual(r.matrixScore.verdict, "grün");
});
