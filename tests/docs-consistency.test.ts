import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_NAMESPACES, resolveSources, STATIC_SOURCES } from "@/lib/engine/check";
import { mailtoContact } from "@/lib/engine/sources/packages";
import { trademarkPrep } from "@/lib/engine/trademark-prep";

// Prüft, dass die Dokumentation zum Stand der Engine passt. Die Tests lesen nur Dateien im
// Repository und brauchen kein Netz.

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** Standardquellen außerhalb von Domains, also die, die `sources` ersetzt. */
const DEFAULT_NON_DOMAIN_IDS = STATIC_SOURCES.filter(
  (s) => s.defaultEnabled && s.namespace !== "domains" && DEFAULT_NAMESPACES.includes(s.namespace),
)
  .map((s) => s.id)
  .sort();

test("docs/trademark-registers.md nennt keine entfernten Quellen und kein erfundenes Feld", () => {
  const doc = read("docs/trademark-registers.md");
  assert.doesNotMatch(doc, /DuckDuckGo/i, "DuckDuckGo ist entfernt (v2-spec.md)");
  assert.doesNotMatch(doc, /registryLinks/, "das Feld registryLinks gibt es nicht");
  assert.equal(
    STATIC_SOURCES.some((s) => /duckduckgo/i.test(s.id)),
    false,
  );
});

test("docs/trademark-registers.md beschreibt die Standardquellen für bekannte Namen", () => {
  const doc = read("docs/trademark-registers.md");
  const knownDefaults = STATIC_SOURCES.filter((s) => s.namespace === "known_names" && s.defaultEnabled);
  assert.deepEqual(knownDefaults.map((s) => s.id).sort(), ["gleif", "known_brands", "wikidata"]);
  assert.match(doc, /`known_brands`/);
  assert.match(doc, /Wikidata/);
  assert.match(doc, /GLEIF/);

  // Wikipedia und Show HN laufen nur auf Wunsch und sind schwache Signale.
  for (const id of ["wikipedia", "hn_show"]) {
    const s = STATIC_SOURCES.find((x) => x.id === id);
    assert.ok(s, `Quelle ${id} fehlt`);
    assert.equal(s.defaultEnabled, false, `${id} darf nicht Standard sein`);
  }
  assert.match(doc, /Wikipedia und Show HN laufen nur auf Wunsch/);
  assert.match(doc, /schwache Signale/);
});

test("der TMDB-Link steht als Eintrag in trademark.links, wie das Dokument sagt", () => {
  const doc = read("docs/trademark-registers.md");
  assert.match(doc, /`trademark\.links`/);
  const tmdb = trademarkPrep("wachwerk").links.find((l) => l.office === "TMDB");
  assert.ok(tmdb, "trademarkPrep liefert keinen TMDB-Link");
  assert.match(tmdb.url, /^https:\/\/tmdb\.eu\//);
});

test("sources ersetzt die Standardquellen außerhalb von Domains", () => {
  const ids = resolveSources({ sources: ["nuget"] }).map((s) => s.id);
  assert.deepEqual(
    ids.filter((id) => !id.startsWith("rdap:") && !id.startsWith("dns:")),
    ["nuget"],
  );
});

test("README und mcp/README warnen, dass sources ersetzt, und nennen die echten Standard-IDs", () => {
  for (const path of ["README.md", "mcp/README.md"]) {
    const doc = read(path);
    assert.match(doc, /ersetzt die Standardquellen/, `${path}: Hinweis fehlt`);
    const start = doc.indexOf("Standardquellen-IDs mit");
    assert.notEqual(start, -1, `${path}: Liste der Standardquellen-IDs fehlt`);
    const sentence = doc.slice(start, doc.indexOf(".", doc.indexOf("`gleif`", start)));
    const listed = [...sentence.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]).sort();
    assert.deepEqual(listed, DEFAULT_NON_DOMAIN_IDS, `${path}: Liste weicht von der Engine ab`);
  }
});

test("Packagist akzeptiert eine E-Mail-Adresse mit oder ohne mailto:, die Doku sagt das", () => {
  assert.equal(mailtoContact("ops@example.org"), "mailto:ops@example.org");
  assert.equal(mailtoContact("mailto:ops@example.org"), "mailto:ops@example.org");
  assert.equal(mailtoContact("https://example.org"), null);
  for (const path of ["README.md", "mcp/README.md", ".env.example"]) {
    const doc = read(path);
    assert.doesNotMatch(doc, /nur mit einer `mailto:`-Adresse/, `${path}: zu streng`);
    assert.match(doc, /mit oder ohne `?mailto:`?/, `${path}: Hinweis fehlt`);
  }
});

test("keine absoluten Versprechen in den Einstiegstexten", () => {
  for (const path of ["README.md", "ROADMAP.md", "docs/v2-spec.md"]) {
    assert.doesNotMatch(read(path), /überall nutzen/, `${path}: „überall“ ist nicht geprüft`);
  }
  assert.doesNotMatch(read("CONTRIBUTING.md"), /sicher freien/);
  assert.doesNotMatch(read("README.md"), /mit Link zu jeder Quelle/);
});

test("Docker-Hinweis zu Umgebungsvariablen steht in README und .env.example", () => {
  assert.match(read("README.md"), /Der Container liest keine `\.env\.local`/);
  assert.match(read(".env.example"), /Docker übernimmt \.env\.local nicht/);
});

test("ROADMAP legt ein Versionsschema fest", () => {
  const roadmap = read("ROADMAP.md");
  assert.match(roadmap, /### Versionsschema/);
  const serverTs = read("src/mcp/server.ts");
  const version = /MCP_SERVER_VERSION = "([\d.]+)"/.exec(serverTs)?.[1];
  assert.ok(version, "MCP_SERVER_VERSION nicht gefunden");
  assert.match(roadmap, new RegExp(`Produktversion\\*\\*, derzeit ${version.replace(/\./g, "\\.")}`));
});
