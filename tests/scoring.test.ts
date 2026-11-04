import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWeightedClearanceScore } from "@/lib/scoring";

const base = {
  word: "fokusnova",
  domainAvailableRatio: 1,
  primaryDomainsFree: true,
  tmRiskScore: 9,
  appStoreScore: 10,
  socialDevScore: 10,
};

test("sauberer Name ohne Konflikte ist grün", () => {
  const r = computeWeightedClearanceScore(base);
  assert.equal(r.verdict, "grün");
  assert.ok(r.totalScore >= 80, `Score ${r.totalScore}`);
});

test("schwere Markenkollision ist rot und der Score bleibt unter 43", () => {
  const r = computeWeightedClearanceScore({ ...base, tmRiskScore: 1 });
  assert.equal(r.verdict, "rot");
  assert.ok(r.totalScore <= 42, `Score ${r.totalScore}`);
});

test("App-Store-Kollision ergibt rot", () => {
  const r = computeWeightedClearanceScore({ ...base, appStoreScore: 2 });
  assert.equal(r.verdict, "rot");
});
