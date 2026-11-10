import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCost, mcpRequestCost } from "@/app/api/_lib/http";
import { CheckInputError, resolveSources, STATIC_SOURCES } from "@/lib/engine/check";
import {
  CHECK_PROFILES,
  describeProfiles,
  effectiveSources,
  PROFILE_IDS,
  selectSources,
  unknownProfileMessage,
} from "@/lib/engine/format";
import { DEFAULT_DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { buildProfiles } from "@/lib/profiles";

const ids = (selection: Parameters<typeof resolveSources>[0]) => resolveSources(selection).map((s) => s.id);
const profile = (id: string) => CHECK_PROFILES.find((p) => p.id === id)!;

test("Profile kommen aus buildProfiles mit den eingebauten Quellen und Standard-Endungen", () => {
  assert.deepEqual(CHECK_PROFILES, buildProfiles(STATIC_SOURCES, DEFAULT_DOMAIN_TLDS));
  assert.deepEqual(PROFILE_IDS, CHECK_PROFILES.map((p) => p.id));
  for (const id of ["allgemein", "web-app", "npm", "python", "rust", "cli"]) assert.ok(PROFILE_IDS.includes(id), id);
  const text = describeProfiles();
  for (const id of PROFILE_IDS) assert.ok(text.includes(`${id} = `), id);
});

test("ohne Profil bleibt die Auswahl wie bisher", () => {
  assert.deepEqual(selectSources({}, true), { namespaces: undefined, tlds: undefined, sources: undefined });
  assert.deepEqual(selectSources({ tlds: ["de"], sources: ["npm"] }, true), { namespaces: undefined, tlds: ["de"], sources: ["npm"] });
  // social ohne sources: MCP und CLI ergänzen die Social-Quellen, /api/check nicht
  assert.deepEqual(selectSources({ namespaces: ["social"] }, true).sources, effectiveSources(["social"], undefined));
  assert.equal(selectSources({ namespaces: ["social"] }, false).sources, undefined);
});

test("ein Profil setzt Namensräume, Quellen und Endungen", () => {
  const npm = selectSources({ profile: "npm" }, true);
  assert.deepEqual(npm, { namespaces: profile("npm").namespaces, tlds: undefined, sources: profile("npm").sources });
  assert.deepEqual(ids(npm), profile("npm").sources, "npm prüft keine Domains");

  const web = selectSources({ profile: "web-app" }, true);
  assert.deepEqual(web.tlds, profile("web-app").tlds);
  assert.deepEqual(ids(web), [...(profile("web-app").tlds ?? []).map((t) => `rdap:${t}`), ...profile("web-app").sources]);

  // allgemein entspricht der Standardauswahl
  assert.deepEqual(ids(selectSources({ profile: "allgemein" }, true)), ids({}));
});

test("ausdrückliche Angaben ersetzen den jeweiligen Teil des Profils", () => {
  const web = profile("web-app");
  // tlds ersetzt nur die Endungen
  assert.deepEqual(selectSources({ profile: "web-app", tlds: ["de"] }, true), { namespaces: web.namespaces, tlds: ["de"], sources: web.sources });
  // sources ersetzt nur die Quellen
  assert.deepEqual(selectSources({ profile: "web-app", sources: ["pypi"] }, true), { namespaces: web.namespaces, tlds: web.tlds, sources: ["pypi"] });
  // namespaces: Quellen und Endungen des Profils nur in den gewählten Namensräumen
  const packagesOnly = selectSources({ profile: "web-app", namespaces: ["packages"] }, true);
  assert.deepEqual(packagesOnly, { namespaces: ["packages"], tlds: undefined, sources: ["npm", "github"] });
  assert.deepEqual(ids(packagesOnly), ["npm", "github"], "ohne domains keine Domains");
  // Namensräume ohne Quelle im Profil bekommen ihre Standardquellen, domains die Standard-Endungen
  const npmPlus = selectSources({ profile: "npm", namespaces: ["domains", "packages", "stores"] }, true);
  const stores = STATIC_SOURCES.filter((s) => s.namespace === "stores" && s.defaultEnabled).map((s) => s.id);
  assert.deepEqual(npmPlus.sources, ["npm", "jsr", "github", ...stores]);
  assert.equal(npmPlus.tlds, undefined);
  assert.deepEqual(ids(npmPlus), [...DEFAULT_DOMAIN_TLDS.map((t) => `rdap:${t}`), "npm", "jsr", "github", ...stores]);
  // social über namespaces: nur MCP und CLI ergänzen Bluesky und Mastodon
  const social = selectSources({ profile: "npm", namespaces: ["packages", "social"] }, true).sources ?? [];
  assert.ok(social.includes("bluesky") && social.includes("mastodon"), social.join(","));
  assert.deepEqual(selectSources({ profile: "npm", namespaces: ["packages", "social"] }, false).sources, ["npm", "jsr", "github"]);
  // alles zusammen: das Profil zählt nicht mehr
  assert.deepEqual(selectSources({ profile: "web-app", namespaces: ["packages"], tlds: ["io"], sources: ["nuget"] }, true), {
    namespaces: ["packages"],
    tlds: ["io"],
    sources: ["nuget"],
  });
});

test("unbekanntes Profil: Eingabefehler mit der Liste der Profile", () => {
  assert.throws(
    () => selectSources({ profile: "gibtsnicht" }, true),
    (e: unknown) => e instanceof CheckInputError && e.message === unknownProfileMessage("gibtsnicht"),
  );
  assert.match(unknownProfileMessage("gibtsnicht"), /^Unbekanntes Profil „gibtsnicht“\. Erlaubt: allgemein, web-app, /);
  assert.throws(() => selectSources({ profile: 42 }, true), CheckInputError);
  assert.throws(() => selectSources({ profile: "npm", namespaces: "packages" }, true), CheckInputError);
});

test("MCP-Kosten entsprechen der Auswahl, mit der das Werkzeug prüft", () => {
  const call = (name: string, args: unknown) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const names = ["alpha", "beta", "gamma"];
  for (const id of PROFILE_IDS) {
    const selection = selectSources({ profile: id }, true);
    assert.deepEqual(mcpRequestCost(call("markenfrei_check_name", { name: "wachwerk", profile: id })), { cost: checkCost(1, selection), outbound: true }, id);
    assert.deepEqual(mcpRequestCost(call("markenfrei_check_names", { names, profile: id })), { cost: checkCost(3, selection), outbound: true }, id);
  }
  // Profil mit ausdrücklichen Angaben
  const args = { profile: "cli", namespaces: ["domains", "packages", "social"], tlds: ["de", "com", "io", "dev", "app", "net", "org", "eu"] };
  const selection = selectSources(args, true);
  assert.deepEqual(mcpRequestCost(call("markenfrei_check_names", { names, ...args })), { cost: checkCost(3, selection), outbound: true });
  assert.ok(checkCost(1, selection) > 1, "größere Auswahl kostet mehr");
  // Unbekanntes Profil: nur die Namen (das Werkzeug lehnt ohne Netzabfrage ab)
  assert.deepEqual(mcpRequestCost(call("markenfrei_check_names", { names, profile: "gibtsnicht" })), { cost: 3, outbound: true });
});
