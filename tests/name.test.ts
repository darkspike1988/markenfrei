import { test } from "node:test";
import assert from "node:assert/strict";
import { foldToAscii, normalizeName } from "@/lib/name";

const ok = (raw: string) => {
  const r = normalizeName(raw);
  assert.ok(r.ok, `"${raw}" sollte gültig sein`);
  return r.ok ? r.name : "";
};
const bad = (raw: string) => assert.equal(normalizeName(raw).ok, false, `"${raw}" sollte abgelehnt werden`);

test("Umlaute und ß werden ausgeschrieben", () => {
  assert.equal(ok("Müller"), "mueller");
  assert.equal(ok("Größe"), "groesse");
  assert.equal(ok("ÄÖÜ"), "aeoeue");
  assert.equal(foldToAscii("Café"), "cafe");
});

test("Leerzeichen und eine bekannte Endung werden entfernt", () => {
  assert.equal(ok("Foo Bar"), "foobar");
  assert.equal(ok("wachwerk.de"), "wachwerk");
  assert.equal(ok("  Fokus-Nova  "), "fokus-nova");
});

test("ungültige Namen werden mit Fehlertext abgelehnt", () => {
  bad("");
  bad("a");
  bad("-foo-");
  bad("foo-");
  bad("---");
  bad("x".repeat(64));
  bad("foo.bar");
  bad("a.b.de");
  bad("!!!");
});

test("63 Zeichen sind erlaubt", () => {
  assert.equal(ok("x".repeat(63)).length, 63);
});

test("Nicht-Strings führen nicht zum Absturz", () => {
  bad(undefined as unknown as string);
  bad(null as unknown as string);
});
