import assert from "node:assert/strict";
import { test } from "node:test";
import { STATIC_SOURCES } from "@/lib/engine/check";
import { isDomainTld } from "@/lib/engine/sources/domains";
import { normalizeName } from "@/lib/name";
import { CANARIES, coverageProblems, PROBE_EXCLUSIONS, type Canary } from "@/lib/probe-canaries";

const IDS = STATIC_SOURCES.map((s) => s.id);

test("Live-Probe: jede Quelle aus STATIC_SOURCES hat einen Kanariennamen oder eine Ausnahme", () => {
  assert.deepEqual(coverageProblems(IDS), []);
  for (const id of IDS) {
    assert.ok(Object.hasOwn(CANARIES, id) !== Object.hasOwn(PROBE_EXCLUSIONS, id), `${id}: genau ein Eintrag`);
  }
});

test("Live-Probe: eine neue Quelle ohne Eintrag wird gemeldet", () => {
  const problems = coverageProblems([...IDS, "neuequelle"]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /„neuequelle“/);
  assert.match(problems[0], /weder einen Kanariennamen noch eine Ausnahme/);
});

test("Live-Probe: Einträge für Quellen, die es nicht gibt, und Doppelungen werden gemeldet", () => {
  const canaries: Record<string, Canary> = { ...CANARIES, alt: { name: "alt", level: "advisory" }, known_brands: { name: "github", level: "gate" } };
  const problems = coverageProblems(IDS, canaries, { ...PROBE_EXCLUSIONS, weg: "Grund" });
  assert.equal(problems.length, 3);
  assert.ok(problems.some((p) => /Kanariennamen für „alt“/.test(p)));
  assert.ok(problems.some((p) => /„known_brands“ steht als Kanariennamen und als Ausnahme/.test(p)));
  assert.ok(problems.some((p) => /Ausnahme für „weg“/.test(p)));
});

test("Live-Probe: eine Ausnahme braucht eine Begründung", () => {
  const problems = coverageProblems(["a"], {}, { a: "  " });
  assert.deepEqual(problems, ["Ausnahme für „a“ braucht eine Begründung"]);
});

test("Live-Probe: Ausnahmen sind nur Quellen ohne Netz", () => {
  assert.deepEqual(Object.keys(PROBE_EXCLUSIONS).sort(), ["known_brands", "wikidata_brands"]);
  for (const id of Object.keys(PROBE_EXCLUSIONS)) {
    const source = STATIC_SOURCES.find((s) => s.id === id);
    assert.match(source?.endpoint ?? "", /^offline:/, `${id}: Ausnahme ohne Netzabfrage`);
  }
});

test("Live-Probe: Kanariennamen sind gültig normalisiert und nehmen nie unknown oder not_found an", () => {
  for (const [id, c] of Object.entries(CANARIES)) {
    const n = normalizeName(c.name);
    assert.ok(n.ok && n.name === c.name, `${id}: ${c.name} ist nicht normalisiert`);
    const accept: readonly string[] = c.accept ?? ["taken"];
    assert.ok(accept.length > 0 && accept.every((s) => s === "taken" || s === "similar"), `${id}: nur taken oder similar`);
  }
});

test("Live-Probe: Domain-Kanarien sind .de, .com und .io, alle wählbare Endungen", () => {
  const domains = Object.keys(CANARIES).filter((id) => id.startsWith("rdap:"));
  assert.deepEqual(domains, ["rdap:de", "rdap:com", "rdap:io"]);
  for (const id of domains) assert.ok(isDomainTld(id.slice("rdap:".length)), id);
});
