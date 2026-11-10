import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHECK_ERRORS, CHECK_MAX_BODY_BYTES, checkBodySchema } from "@/app/api/_lib/check-schema";
import { POST as checkPOST } from "@/app/api/check/route";
import { GET as healthGET } from "@/app/api/health/route";
import { GET as openapiGET } from "@/app/api/openapi.json/route";
import { DEFAULT_NAMESPACES, MAX_NAMES, MAX_TLDS, resolveSources, STATIC_SOURCES } from "@/lib/engine/check";
import { NameReportSchema, ShortlistEntrySchema } from "@/lib/engine/report-schema";
import { DEFAULT_DOMAIN_TLDS, DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { NAMESPACES } from "@/lib/engine/types";
import { STATUS_LABEL, VERDICT_LABEL } from "@/lib/engine/verdict";
import { buildOpenApiDocument, EXAMPLE_CHECK_REQUESTS, exampleCheckResponse, OPENAPI_MAX_AGE_SECONDS } from "@/lib/openapi";
import { PROFILE_IDS, selectSources } from "@/lib/engine/format";
import { REGISTER_NOTICE } from "@/lib/register";
import { DEFAULT_RATE_LIMIT, rateLimitMessage } from "@/lib/rate-limit";
import { DEFAULT_PUBLIC_URL, SITEMAP_PATHS } from "@/lib/site";

import { metadata as apiDocsMeta } from "@/app/api-docs/page";
import { metadata as mcpMeta } from "@/app/mcp/page";

// Lockerer Zugriff auf das Dokument: die Tests prüfen die Form, nicht den Typ.
const doc = buildOpenApiDocument() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const schemas = doc.components.schemas as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const realPublic = process.env.MARKENFREI_PUBLIC_URL;
const realFetch = globalThis.fetch;
beforeEach(() => {
  delete process.env.MARKENFREI_PUBLIC_URL;
  // Die Dokumentations- und Health-Routen dürfen nie ins Netz.
  globalThis.fetch = (() => Promise.reject(new Error("kein Netz erlaubt"))) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realPublic === undefined) delete process.env.MARKENFREI_PUBLIC_URL;
  else process.env.MARKENFREI_PUBLIC_URL = realPublic;
});

function walk(value: unknown, visit: (node: unknown, path: string) => void, path = "#"): void {
  visit(value, path);
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, visit, `${path}/${i}`));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, visit, `${path}/${k}`);
  }
}

test("OpenAPI-Dokument: Version, Pfade, Info, Server", () => {
  assert.equal(doc.openapi, "3.1.0");
  assert.equal(doc.info.title, "Markenfrei API");
  assert.match(doc.info.version, /^\d+\.\d+\.\d+$/);
  assert.equal(doc.info.license.identifier, "MIT");
  assert.deepEqual(doc.servers, [{ url: DEFAULT_PUBLIC_URL, description: "Diese Instanz" }]);
  assert.deepEqual(Object.keys(doc.paths).sort(), ["/api/check", "/api/health", "/api/mcp", "/api/sources"]);
  assert.deepEqual(Object.keys(doc.paths["/api/check"]), ["post"]);
  assert.deepEqual(Object.keys(doc.paths["/api/health"]), ["get"]);
  // interne Routen bleiben draußen
  const text = JSON.stringify(doc);
  assert.doesNotMatch(text, /\/api\/contact|opendata-words/);
  for (const name of ["CheckRequest", "CheckResponse", "NameReport", "SourceResult", "TrademarkPrep", "ShortlistEntry", "Error"]) {
    assert.ok(schemas[name], `components.schemas.${name} fehlt`);
  }
});

/** Name des Schemas, auf das ein $ref-Knoten zeigt; undefined bei anderen Knoten. */
function refTarget(node: unknown): string | undefined {
  if (node && typeof node === "object" && "$ref" in node) return String(node.$ref);
  return undefined;
}

test("OpenAPI-Dokument ist reines JSON ohne undefined und alle $ref lösen auf", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc);
  let refs = 0;
  const used = new Set<string>();
  walk(doc, (node, path) => {
    assert.notEqual(node, undefined, `${path} ist undefined`);
    const target = refTarget(node);
    if (target === undefined) return;
    refs++;
    assert.match(target, /^#\/components\/schemas\/[A-Za-z]+$/, `${path}: ${target}`);
    const name = target.slice("#/components/schemas/".length);
    assert.ok(schemas[name], `${path}: ${target} existiert nicht`);
    used.add(name);
  });
  assert.ok(refs >= 10, "erwartet viele $ref");
  // jedes Schema wird benutzt (kein totes Schema)
  for (const name of Object.keys(schemas)) assert.ok(used.has(name), `Schema ${name} wird nirgends referenziert`);
});

test("Aufzählungen stimmen mit den Konstanten im Code überein", () => {
  const props = schemas.CheckRequest.properties;
  // Endungen werden nicht aufgezählt (über 1.000): Muster, Verweis auf /api/sources
  assert.equal(props.tlds.items.enum, undefined);
  const pattern = new RegExp(props.tlds.items.pattern);
  for (const t of ["de", ".DE", "shop"]) assert.ok(pattern.test(t), t);
  for (const t of ["", "d", "a b", "xn--abc", "de/x"]) assert.ok(!pattern.test(t), t);
  assert.match(props.tlds.description, /\/api\/sources/);
  assert.deepEqual(props.tlds.default, [...DEFAULT_DOMAIN_TLDS]);
  assert.deepEqual(props.namespaces.items.enum, [...NAMESPACES]);
  assert.deepEqual(props.namespaces.default, [...DEFAULT_NAMESPACES]);
  assert.deepEqual(props.sources.items.enum, STATIC_SOURCES.map((s) => s.id));
  // optionale Quellen sind dabei
  for (const id of ["nuget", "bluesky", "wikipedia", "hn_show", "clojars"]) assert.ok(props.sources.items.enum.includes(id), id);

  assert.deepEqual(schemas.SourceResult.properties.status.enum, Object.keys(STATUS_LABEL));
  assert.deepEqual(schemas.SourceResult.properties.namespace.enum, [...NAMESPACES]);
  assert.deepEqual(schemas.NameReport.properties.verdict.enum, Object.keys(VERDICT_LABEL));
  assert.deepEqual(schemas.ShortlistEntry.properties.verdict.enum, Object.keys(VERDICT_LABEL));
  assert.deepEqual(Object.keys(schemas.NameReport.properties.counts.properties), Object.keys(STATUS_LABEL));
  assert.equal(schemas.TrademarkPrep.properties.status.const, "not_checked");
  assert.equal(schemas.NameReport.properties.schemaVersion.const, 2);
  assert.match(schemas.SourceResult.properties.status.description, /nie als frei/);

  assert.deepEqual(props.profile.enum, [...PROFILE_IDS]);
  assert.equal(props.profile.type, "string");
  for (const id of PROFILE_IDS) assert.ok(props.profile.description.includes(`${id} = `), id);
  assert.deepEqual(doc["x-markenfrei"].profiles, [...PROFILE_IDS]);
});

test("SourceResult.register: optional, beschrieben als Angebot des Betreibers, mit Beispiel", () => {
  const register = schemas.SourceResult.properties.register;
  assert.ok(register, "register fehlt im Schema");
  assert.ok(!(schemas.SourceResult.required ?? []).includes("register"), "register ist optional");
  assert.deepEqual(register.required, ["label", "url", "notice"]);
  assert.match(register.description, /Angebot des Betreibers/);
  assert.match(register.description, /kostenpflichtig/);
  assert.match(register.description, /not_found/);
  assert.equal(register.examples.length, 1);
  assert.equal(register.examples[0].notice, REGISTER_NOTICE);
  assert.match(register.examples[0].url, /^https:\/\/example\.org\//);
  assert.match(doc.paths["/api/check"].post.description, /\*\*Registrierungs-Link:\*\*/);
  // Die Beispielantwort zeigt keinen Link: ohne Einstellung des Betreibers fehlt das Feld.
  assert.ok(exampleCheckResponse().reports.every((r) => r.results.every((x) => x.register === undefined)));
});

test("Grenzen im Dokument kommen aus den Konstanten", () => {
  const props = schemas.CheckRequest.properties;
  assert.equal(props.names.minItems, 1);
  assert.equal(props.names.maxItems, MAX_NAMES);
  assert.deepEqual(schemas.CheckRequest.required, ["names"]);
  const limits = doc["x-markenfrei"].limits;
  assert.equal(limits.maxNames, MAX_NAMES);
  assert.equal(limits.maxTlds, MAX_TLDS);
  assert.equal(limits.maxBodyBytes, CHECK_MAX_BODY_BYTES);
  assert.equal(limits.maxBodyBytes, 16 * 1024);
  assert.equal(limits.rateLimitPerWindow, DEFAULT_RATE_LIMIT);
  assert.equal(DEFAULT_RATE_LIMIT, 60);
  assert.equal(limits.rateLimitWindowSeconds, 60);
  const description: string = doc.paths["/api/check"].post.description;
  assert.match(description, new RegExp(`${MAX_NAMES} Namen`));
  assert.match(description, /16 KB/);
  assert.match(description, /60 Einheiten pro Minute/);
});

test("alle Beispielanfragen sind gültig für Schema und Engine", () => {
  for (const [key, body] of Object.entries(EXAMPLE_CHECK_REQUESTS)) {
    const parsed = checkBodySchema.safeParse(body);
    assert.ok(parsed.success, `${key}: ${parsed.success ? "" : parsed.error.message}`);
    resolveSources(selectSources(parsed.data, false));
  }
  const examples = doc.paths["/api/check"].post.requestBody.content["application/json"].examples;
  assert.deepEqual(
    Object.values(examples).map((e) => (e as { value: unknown }).value),
    [EXAMPLE_CHECK_REQUESTS.single, EXAMPLE_CHECK_REQUESTS.shortlist, EXAMPLE_CHECK_REQUESTS.selection, EXAMPLE_CHECK_REQUESTS.profile],
  );
});

test("Beispielantwort entspricht den Berichtsschemas und nennt nur echte Quellen", () => {
  const example = exampleCheckResponse();
  assert.deepEqual(schemas.CheckResponse.example, example);
  assert.equal(example.reports.length, 1);
  for (const report of example.reports) {
    const parsed = NameReportSchema.safeParse(report);
    assert.ok(parsed.success, parsed.success ? "" : parsed.error.message);
    assert.equal(report.trademark.status, "not_checked");
    const real = new Map(resolveSources({ tlds: ["de", "com"] }).map((s) => [s.id, s]));
    for (const r of report.results) {
      const source = real.get(r.sourceId);
      assert.ok(source, `${r.sourceId} ist keine Quelle`);
      assert.equal(source.label, r.label);
      assert.equal(source.namespace, r.namespace);
    }
    // Ampel und Zählung folgen aus den Ergebnissen (nicht von Hand gesetzt)
    assert.equal(report.verdict, "yellow");
    assert.equal(report.counts.unknown, 1);
    assert.deepEqual(report.incomplete, ["App Store"]);
  }
  for (const entry of example.ranking) assert.ok(ShortlistEntrySchema.safeParse(entry).success);
  assert.deepEqual(example.ranking.map((e) => e.name), example.reports.map((r) => r.name));
});

test("Fehlerantworten von /api/check: Statuscodes und Meldungen entsprechen der Route", async () => {
  const documented = doc.paths["/api/check"].post.responses as Record<string, { content?: Record<string, { example?: { error: string } }> }>;
  assert.deepEqual(Object.keys(documented), ["200", "400", "403", "413", "415", "429", "500"]);
  const message = (status: string) => documented[status].content?.["application/json"]?.example?.error;

  const call = async (init: RequestInit & { headers?: Record<string, string> }) => {
    const res = await checkPOST(new Request("http://localhost/api/check", { method: "POST", ...init }));
    return { status: res.status, body: (await res.json()) as { error: string }, cache: res.headers.get("cache-control") };
  };
  const json = { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.77" };

  const forbidden = await call({ headers: { ...json, Origin: "https://fremd.example" }, body: "{}" });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(forbidden.body, { error: message("403") });
  assert.equal(forbidden.cache, "no-store");

  const type = await call({ headers: { "Content-Type": "text/plain", "x-forwarded-for": "198.51.100.77" }, body: "{}" });
  assert.equal(type.status, 415);
  assert.deepEqual(type.body, { error: message("415") });

  const big = await call({ headers: json, body: JSON.stringify({ names: ["x".repeat(CHECK_MAX_BODY_BYTES)] }) });
  assert.equal(big.status, 413);
  assert.deepEqual(big.body, { error: message("413") });

  const broken = await call({ headers: json, body: "{" });
  assert.equal(broken.status, 400);
  assert.equal(broken.body.error, CHECK_ERRORS.invalidJson);

  const tooMany = await call({ headers: json, body: JSON.stringify({ names: Array.from({ length: MAX_NAMES + 1 }, (_, i) => `name${i}`) }) });
  assert.equal(tooMany.status, 400);
  assert.deepEqual(tooMany.body, { error: message("400") });

  assert.equal(message("429"), rateLimitMessage(12));
  assert.equal(message("500"), CHECK_ERRORS.failed);
  // 502 erzeugt /api/check nie und steht deshalb nicht im Dokument
  assert.equal("502" in documented, false);
});

test("GET /api/openapi.json: JSON, eine Stunde öffentlich zwischenspeicherbar, Adresse aus der Konfiguration", async () => {
  const res = openapiGET(new Request("http://localhost/api/openapi.json"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(res.headers.get("cache-control"), `public, max-age=${OPENAPI_MAX_AGE_SECONDS}`);
  assert.equal(OPENAPI_MAX_AGE_SECONDS, 3600);
  assert.deepEqual(await res.json(), JSON.parse(JSON.stringify(buildOpenApiDocument(DEFAULT_PUBLIC_URL))));

  process.env.MARKENFREI_PUBLIC_URL = "https://marken.example.org/";
  const own = (await openapiGET(new Request("http://localhost/api/openapi.json")).json()) as { servers: { url: string }[]; info: { description: string } };
  assert.equal(own.servers[0].url, "https://marken.example.org");
  assert.match(own.info.description, /https:\/\/marken\.example\.org\/api-docs/);
});

test("GET /api/health: ok, Version aus package.json, no-store, ohne Netz und ohne Umgebung", async () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as { version: string };
  const res = healthGET(new Request("http://localhost/api/health"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { status: "ok", version: pkg.version });
});

test("Die Seite /api-docs steht in der Sitemap und hat eigenen Titel und Beschreibung", () => {
  assert.ok(SITEMAP_PATHS.includes("/api-docs"));
  assert.equal(apiDocsMeta.title, "API für Entwickler");
  assert.ok(String(apiDocsMeta.description).length > 0 && String(apiDocsMeta.description).length < 160);
  assert.notEqual(apiDocsMeta.title, mcpMeta.title);
  assert.notEqual(apiDocsMeta.description, mcpMeta.description);
});

// --- GET /api/sources -------------------------------------------------------

import { GET as sourcesGET } from "@/app/api/sources/route";
import { buildSourcesCatalog, SourcesCatalogSchema } from "@/lib/sources-catalog";

test("GET /api/sources: Katalog passt zum Schema, enthält jede Quelle und Endung, fragt nichts ab", async () => {
  const res = sourcesGET(new Request("http://localhost/api/sources"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control") ?? "", /public, max-age=\d+/);
  const json = SourcesCatalogSchema.parse(await res.json());
  assert.deepEqual(json.sources.map((s) => s.id), STATIC_SOURCES.map((s) => s.id));
  assert.deepEqual(json.tlds.map((t) => t.tld), [...DOMAIN_TLDS]);
  assert.deepEqual(json.tlds.filter((t) => t.default).map((t) => t.tld), [...DEFAULT_DOMAIN_TLDS]);
  assert.deepEqual(json.namespaces.filter((n) => n.default).map((n) => n.id), [...DEFAULT_NAMESPACES]);
  assert.deepEqual(json.limits, { maxNames: MAX_NAMES, maxTlds: MAX_TLDS });
  // jede ID aus dem Katalog ist für /api/check gültig
  resolveSources({ sources: json.sources.map((s) => s.id) });
  // jedes Profil ist für /api/check gültig, ohne Registrierungsdienst nur configured: false
  assert.deepEqual(json.profiles.map((p) => p.id), [...PROFILE_IDS]);
  for (const p of json.profiles) resolveSources(selectSources({ profile: p.id }, false));
  assert.deepEqual(json.register, { configured: false });
});

test("GET /api/sources nennt einen eingestellten Registrierungsdienst nur mit Namen, nie mit Vorlage", async () => {
  const saved = { url: process.env.MARKENFREI_REGISTER_URL, name: process.env.MARKENFREI_REGISTER_NAME };
  process.env.MARKENFREI_REGISTER_URL = "https://example.org/geheim/bestellen?domain={domain}";
  process.env.MARKENFREI_REGISTER_NAME = "Beispiel-Domains";
  try {
    const res = sourcesGET(new Request("http://localhost/api/sources"));
    const text = await res.text();
    assert.deepEqual(SourcesCatalogSchema.parse(JSON.parse(text)).register, { configured: true, name: "Beispiel-Domains" });
    assert.ok(!text.includes("example.org"), "die Vorlage bleibt intern");
  } finally {
    for (const [key, value] of [
      ["MARKENFREI_REGISTER_URL", saved.url],
      ["MARKENFREI_REGISTER_NAME", saved.name],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("OpenAPI: /api/sources ist beschrieben und das Beispiel entspricht dem Katalog", () => {
  assert.ok(schemas.SourcesCatalog);
  const example = doc.paths["/api/sources"].get.responses["200"].content["application/json"].example;
  assert.deepEqual(example, buildSourcesCatalog(null));
  assert.deepEqual(example.register, { configured: false });
});

// --- /llms.txt --------------------------------------------------------------

import { GET as llmsGET } from "@/app/llms.txt/route";

test("/llms.txt: Text mit Standardquellen aus dem Code, Warnhinweis zu Grün, nur Links auf die eigene Adresse", async () => {
  const res = llmsGET(new Request("http://localhost/llms.txt"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^text\/plain/);
  const text = await res.text();
  assert.match(text, /^# Markenfrei\n/);
  assert.match(text, /Grün heißt nur/);
  for (const s of STATIC_SOURCES.filter((x) => x.defaultEnabled)) assert.ok(text.includes(s.id), s.id);
  assert.ok(text.includes(`${DEFAULT_PUBLIC_URL.replace(/\/+$/, "")}/api/sources`));
  const hosts = new Set([...text.matchAll(/\]\((https?:\/\/[^/)]+)/g)].map((m) => m[1]));
  assert.deepEqual([...hosts], [DEFAULT_PUBLIC_URL.replace(/\/+$/, "")]);
});
