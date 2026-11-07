import assert from "node:assert/strict";
import { test } from "node:test";
import { isStale, probeStatusSchema, toProbeStatus } from "@/lib/probe-status";

const NOW = new Date("2026-11-07T12:00:00.000Z");

test("toProbeStatus: ok bleibt ok, advisory-Abweichung wird warning, gate-Abweichung wird error", () => {
  const out = toProbeStatus(
    [
      { id: "npm", ok: true, level: "gate" },
      { id: "github", ok: true, level: "advisory" },
      { id: "hex", ok: false, level: "advisory" },
      { id: "pypi", ok: false, level: "gate" },
    ],
    NOW,
  );
  assert.deepEqual(out.sources, [
    { id: "npm", status: "ok" },
    { id: "github", status: "ok" },
    { id: "hex", status: "warning" },
    { id: "pypi", status: "error" },
  ]);
  assert.equal(out.generatedAt, "2026-11-07T12:00:00.000Z");
  assert.ok(probeStatusSchema.safeParse(out).success);
});

test("toProbeStatus übernimmt weder Notiz noch Zufallsnamen", () => {
  const row = { id: "npm", ok: false, level: "gate", note: "zqgeheimx: found (HTTP 200)", free: "zqgeheimx", taken: "taken" };
  const out = toProbeStatus([row], NOW);
  assert.deepEqual(Object.keys(out.sources[0]).sort(), ["id", "status"]);
  assert.doesNotMatch(JSON.stringify(out), /zqgeheimx|HTTP|taken/);
  assert.equal(probeStatusSchema.safeParse({ ...out, sources: [{ ...out.sources[0], note: "x" }] }).success, false);
});

test("isStale: 13 Tage 23 Stunden nicht veraltet, 14 Tage und 1 ms veraltet", () => {
  const day = 24 * 60 * 60 * 1000;
  const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  assert.equal(isStale(at(13 * day + 23 * 3600_000), NOW), false);
  assert.equal(isStale(at(14 * day), NOW), false);
  assert.equal(isStale(at(14 * day + 1), NOW), true);
  assert.equal(isStale("kein Datum", NOW), true);
});
