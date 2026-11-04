import { test } from "node:test";
import assert from "node:assert/strict";
import { operatorFromEnv } from "@/lib/legal";

const full = {
  MARKENFREI_OPERATOR_NAME: " Erika Mustermann ",
  MARKENFREI_OPERATOR_ADDRESS: "Musterstraße 1\\n12345 Musterstadt",
  MARKENFREI_OPERATOR_EMAIL: "kontakt@example.org",
  MARKENFREI_HOSTING_PROVIDER: "Beispiel-Hosting GmbH, Musterstadt",
};

test("vollständige Angaben: nichts fehlt, Zeilenumbrüche und Leerraum werden bereinigt", () => {
  const r = operatorFromEnv(full);
  assert.equal(r.complete, true);
  assert.deepEqual(r.missing, []);
  assert.equal(r.operator.name, "Erika Mustermann");
  assert.equal(r.operator.address, "Musterstraße 1\n12345 Musterstadt");
});

test("ohne Umgebung fehlen alle Pflichtangaben und nichts wird erfunden", () => {
  const r = operatorFromEnv({});
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing, [
    "MARKENFREI_OPERATOR_NAME",
    "MARKENFREI_OPERATOR_ADDRESS",
    "MARKENFREI_OPERATOR_EMAIL",
    "MARKENFREI_HOSTING_PROVIDER",
  ]);
  assert.equal(r.operator.name, "");
});

test("ungültige E-Mail-Adressen zählen als fehlend", () => {
  for (const bad of ["kontakt", "a@b", "a b@c.de", "<x@y.de>", "@example.org", ""]) {
    const r = operatorFromEnv({ ...full, MARKENFREI_OPERATOR_EMAIL: bad });
    assert.ok(r.missing.includes("MARKENFREI_OPERATOR_EMAIL"), bad);
  }
});

test("Telefon ist freiwillig", () => {
  assert.equal(operatorFromEnv(full).complete, true);
  assert.equal(operatorFromEnv({ ...full, MARKENFREI_OPERATOR_PHONE: "+49 123 456" }).operator.phone, "+49 123 456");
});
