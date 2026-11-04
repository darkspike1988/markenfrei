import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TLDS, MAX_TLDS_PER_REQUEST, SUPPORTED_TLDS, parseTlds } from "@/lib/tlds";
import { RDAP_BASE } from "@/lib/clearance";

test("Standardliste bei leerer Eingabe", () => {
  assert.deepEqual(parseTlds(undefined), { ok: true, tlds: [...DEFAULT_TLDS] });
  assert.deepEqual(parseTlds([]), { ok: true, tlds: [...DEFAULT_TLDS] });
});

test("Schreibweise, Punkt und Duplikate werden bereinigt", () => {
  assert.deepEqual(parseTlds([".DE", "de", "com"]), { ok: true, tlds: ["de", "com"] });
});

test("Unbekannte oder gefährliche Endungen werden abgelehnt", () => {
  for (const bad of ["constructor", "__proto__", "xyz", "", "de/../x"]) {
    assert.equal(parseTlds([bad]).ok, false, bad);
  }
  assert.equal(parseTlds("de").ok, false);
});

test("zu viele Endungen werden abgelehnt", () => {
  assert.ok(SUPPORTED_TLDS.length > MAX_TLDS_PER_REQUEST);
  assert.equal(parseTlds([...SUPPORTED_TLDS]).ok, false);
  assert.equal(parseTlds(SUPPORTED_TLDS.slice(0, MAX_TLDS_PER_REQUEST)).ok, true);
});

test("jede RDAP-Endung ist unterstützt", () => {
  for (const tld of Object.keys(RDAP_BASE)) {
    assert.ok((SUPPORTED_TLDS as readonly string[]).includes(tld), tld);
  }
});
