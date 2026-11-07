import { test } from "node:test";
import assert from "node:assert/strict";
import { checkNames, clearResultCache } from "@/lib/engine/check";

// Regression: crates.io (API: 1 Anfrage pro Sekunde) ließ bei Shortlists die meisten Namen als
// "unknown/budget" enden. Über den Sparse-Index bekommt jeder Name der Shortlist ein Ergebnis.
test("Shortlist: jeder Name bekommt ein crates.io-Ergebnis, keines endet am Abfragebudget", async () => {
  clearResultCache();
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    calls.push(String(input));
    return new Response("{}", { status: 404 });
  };
  const names = ["alphaone", "bravotwo", "charliethree", "deltafour", "echofive", "foxtrotsix"];
  const { reports } = await checkNames(names, { fetchImpl, namespaces: ["packages"] });
  for (const r of reports) {
    const c = r.results.find((x) => x.sourceId === "crates");
    assert.equal(c?.status, "not_found", `${r.name}: ${c?.evidence}`);
  }
  assert.ok(!calls.some((u) => u.startsWith("https://crates.io/api/")), "die API wird nicht gebraucht");
});
