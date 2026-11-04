import { test } from "node:test";
import assert from "node:assert/strict";
import { PRICING_AS_OF, compareDomainPrices } from "@/lib/domain-pricing";

test("Preisvergleich trägt den Stand der Preise", () => {
  const c = compareDomainPrices("foo.com");
  assert.ok(c);
  assert.equal(c.asOf, PRICING_AS_OF);
  assert.ok(c.registrars.length > 0);
  // sortiert nach Dauerpreis aufsteigend
  for (let i = 1; i < c.registrars.length; i++) {
    assert.ok(c.registrars[i - 1].renewalEur <= c.registrars[i].renewalEur);
  }
});

test("unbekannte oder gefährliche Endungen liefern null", () => {
  for (const d of ["foo.constructor", "foo.__proto__", "foo.xyz", "foo.fr"]) {
    assert.equal(compareDomainPrices(d), null, d);
  }
});
