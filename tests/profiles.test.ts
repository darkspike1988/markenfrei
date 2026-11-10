import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_TLDS, resolveSources, STATIC_SOURCES } from "@/lib/engine/check";
import { DEFAULT_DOMAIN_TLDS, DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { NAMESPACES } from "@/lib/engine/types";
import { buildProfiles } from "@/lib/profiles";
import { buildCheckerConfig } from "@/lib/checker-setup";
import {
  buildQuery,
  buildRequestBody,
  checkerProfiles,
  matchesProfile,
  parseSelection,
  selectedSources,
} from "@/components/checker-config";

const profiles = buildProfiles(STATIC_SOURCES, DEFAULT_DOMAIN_TLDS);
const known = new Set(STATIC_SOURCES.map((s) => s.id));

test("Vorhaben: feste, kleingeschriebene IDs in fester Reihenfolge, Allgemein zuerst", () => {
  assert.deepEqual(
    profiles.map((p) => p.id),
    ["allgemein", "web-app", "mobile-app", "npm", "python", "rust", "dart", "php", "ruby", "dotnet", "java", "cli"],
  );
});

test("Vorhaben: jedes fragt mindestens eine Quelle ab, nur bekannte IDs, immer mit Bekannten Namen", () => {
  const knownNames = STATIC_SOURCES.filter((s) => s.defaultEnabled && s.namespace === "known_names").map((s) => s.id);
  for (const p of profiles) {
    assert.ok(p.sources.length > 0, p.id);
    assert.deepEqual(p.sources.filter((id) => !known.has(id)), [], p.id);
    assert.ok(p.namespaces.every((ns) => NAMESPACES.includes(ns)), p.id);
    assert.ok(p.namespaces.includes("known_names"), p.id);
    assert.ok(knownNames.every((id) => p.sources.includes(id)), p.id);
    if (p.tlds) {
      assert.ok(p.namespaces.includes("domains"), p.id);
      assert.ok(p.tlds.length > 0 && p.tlds.length <= MAX_TLDS, p.id);
      assert.ok(p.tlds.every((t) => DOMAIN_TLDS.includes(t)), p.id);
    } else {
      assert.equal(p.namespaces.includes("domains"), false, p.id);
    }
    // Die Engine nimmt jedes Vorhaben ohne Fehler an.
    assert.ok(resolveSources({ namespaces: p.namespaces, tlds: p.tlds, sources: p.sources }).length > 0, p.id);
  }
});

test("Vorhaben: Allgemein ist die Standardauswahl, Dart fragt pub.dev und GitHub ab", () => {
  const general = profiles.find((p) => p.id === "allgemein")!;
  assert.deepEqual(general.sources, STATIC_SOURCES.filter((s) => s.defaultEnabled).map((s) => s.id));
  assert.deepEqual(general.tlds, [...DEFAULT_DOMAIN_TLDS]);
  const dart = profiles.find((p) => p.id === "dart")!;
  assert.deepEqual(dart.namespaces, ["packages", "known_names"]);
  assert.ok(dart.sources.includes("pub") && dart.sources.includes("github"));
  assert.equal(dart.sources.includes("npm"), false);
});

test("Vorhaben: unbekannte Quellen fallen weg, ein Namensraum ohne Quelle ebenso", () => {
  const list = [
    { id: "github", namespace: "packages" as const, defaultEnabled: true },
    { id: "known_brands", namespace: "known_names" as const, defaultEnabled: true },
  ];
  const built = buildProfiles(list, ["de"]);
  for (const p of built) assert.ok(p.sources.every((id) => id === "github" || id === "known_brands"), p.id);
  const mobile = built.find((p) => p.id === "mobile-app")!;
  assert.deepEqual(mobile.namespaces, ["domains", "known_names"], "ohne Store-Quellen kein Namensraum App Stores");
  assert.deepEqual(mobile.sources, ["known_brands"]);
});

test("Vorhaben in der Oberfläche: gleiche Quellen wie die Daten, Link hin und zurück, auch auf Anleitungsseiten", () => {
  for (const config of [buildCheckerConfig(), buildCheckerConfig(["packages"])]) {
    const ui = checkerProfiles(config);
    assert.deepEqual(ui.map((p) => p.id), profiles.map((p) => p.id));
    for (const [i, p] of ui.entries()) {
      assert.deepEqual(new Set(selectedSources(p, config)), new Set(profiles[i].sources), p.id);
      const body = buildRequestBody("wachwerk", p, config);
      assert.ok(resolveSources(body).length > 0, p.id);
      assert.deepEqual((body.sources ?? []).filter((id) => !known.has(id)), [], p.id);
      const sel = parseSelection(new URLSearchParams(buildQuery({ names: ["wachwerk"], ...p }, config)), config);
      assert.deepEqual(sel.names, ["wachwerk"]);
      assert.ok(matchesProfile(sel, p, config), `${p.id} übersteht den Link`);
      // Kein anderes Vorhaben passt auf dieselbe Auswahl.
      assert.deepEqual(ui.filter((q) => matchesProfile(sel, q, config)).map((q) => q.id), [p.id]);
    }
  }
});
