import { test } from "node:test";
import assert from "node:assert/strict";
import { OPEN_APIS } from "@/lib/open-apis";
import { RDAP_BASE } from "@/lib/clearance";

test("jeder RDAP-Eintrag im Inventar entspricht einem Server im Code", () => {
  const bases = new Set(Object.values(RDAP_BASE));
  const rdap = OPEN_APIS.filter((a) => a.protocol.startsWith("RDAP"));
  assert.ok(rdap.length > 0);
  for (const a of rdap) {
    const base = a.endpoint.replace("{domain}", "");
    assert.ok(bases.has(base), `${a.name}: ${base} fehlt in RDAP_BASE`);
  }
});

test("jeder RDAP-Host im Code steht im Inventar", () => {
  const host = (u: string) => new URL(u.replace("{domain}", "x")).host;
  const inv = new Set(
    OPEN_APIS.filter((a) => a.protocol.startsWith("RDAP")).map((a) => host(a.endpoint)),
  );
  for (const base of new Set(Object.values(RDAP_BASE))) {
    assert.ok(inv.has(host(base)), `${host(base)} fehlt im Inventar`);
  }
});
