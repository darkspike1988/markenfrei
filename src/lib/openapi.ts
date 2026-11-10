import { z } from "zod";
import { CHECK_ERRORS, CHECK_LIMITS, CHECK_MAX_BODY_BYTES, checkBodySchema } from "@/app/api/_lib/check-schema";
import { DEFAULT_NAMESPACES, MAX_NAMES, MAX_TLDS, STATIC_SOURCES, type NameReport, type ShortlistEntry } from "@/lib/engine/check";
import { describeProfiles, PROFILE_IDS } from "@/lib/engine/format";
import {
  NameReportSchema,
  ShortlistEntrySchema,
  SourceResultSchema,
  TrademarkPrepSchema,
} from "@/lib/engine/report-schema";
import { DEFAULT_DOMAIN_TLDS, FEATURED_TLDS, domainSources } from "@/lib/engine/sources/domains";
import { manualSocialLinks } from "@/lib/engine/sources/stores-social";
import { trademarkPrep } from "@/lib/engine/trademark-prep";
import { NAMESPACE_LABEL, NAMESPACES, type SourceResult } from "@/lib/engine/types";
import { computeVerdict, countStatuses, rankReports, STATUS_LABEL, VERDICT_LABEL } from "@/lib/engine/verdict";
import { DEFAULT_CACHE_TTL_MS } from "@/lib/cache";
import { DEFAULT_RATE_LIMIT, RATE_LIMIT_WINDOW_MS, rateLimitMessage } from "@/lib/rate-limit";
import { DEFAULT_PUBLIC_URL } from "@/lib/site";
import { REGISTER_NOTICE } from "@/lib/register";
import { buildSourcesCatalog, SourcesCatalogSchema, SOURCES_MAX_AGE_SECONDS } from "@/lib/sources-catalog";
import { APP_VERSION } from "@/lib/version";

/**
 * OpenAPI-3.1-Beschreibung der öffentlichen HTTP-Schnittstelle (GET /api/openapi.json).
 *
 * Alles, was sich im Code ändern kann, wird aus dem Code gelesen: Endungen, Namensräume,
 * Quellen-IDs, Status, Ampel, Grenzen und die Antwortschemas (aus den zod-Schemas, die auch
 * der MCP-Server als outputSchema nutzt). Nicht beschrieben sind /api/contact und
 * /api/opendata-words: Das sind interne Routen der Oberfläche.
 */

type JsonObject = { [key: string]: unknown };

/** Rate-Limit-Standard: Einheiten pro Fenster (MARKENFREI_RATE_LIMIT ändert ihn pro Betreiber). */
export const RATE_LIMIT_PER_MINUTE = DEFAULT_RATE_LIMIT;
/** Zwischenspeicher für eindeutige Quellenantworten in Sekunden (Standard). */
export const CACHE_TTL_SECONDS = Math.round(DEFAULT_CACHE_TTL_MS / 1000);
/** Cache-Dauer der OpenAPI-Datei selbst in Sekunden. */
export const OPENAPI_MAX_AGE_SECONDS = 3600;

const SOURCE_IDS = STATIC_SOURCES.map((s) => s.id);
const DEFAULT_SOURCE_IDS = STATIC_SOURCES.filter((s) => s.defaultEnabled).map((s) => s.id);
const STATUSES = Object.keys(STATUS_LABEL);
const VERDICTS = Object.keys(VERDICT_LABEL);

// --- Beispiele ------------------------------------------------------------

/** Beispielanfragen (alle gültig für checkBodySchema und resolveSources; tests/openapi.test.ts prüft das). */
export const EXAMPLE_CHECK_REQUESTS = {
  /** Ein Name mit Standardauswahl */
  single: { names: ["wachwerk"] },
  /** Shortlist mit Standardauswahl */
  shortlist: { names: ["wachwerk", "fokusnova", "klarwerk"] },
  /** Auswahl von Endungen, Namensräumen und Quellen */
  selection: {
    names: ["wachwerk"],
    tlds: ["de", "com", "dev"],
    namespaces: ["domains", "packages", "social"],
    sources: ["npm", "pypi", "nuget", "bluesky"],
  },
  /** Profil für ein npm-Paket */
  profile: { names: ["wachwerk", "fokusnova"], profile: "npm" },
};

function pick(id: string): { sourceId: string; namespace: SourceResult["namespace"]; label: string } {
  const s = STATIC_SOURCES.find((x) => x.id === id);
  if (!s) throw new Error(`Unbekannte Quelle ${id}`);
  return { sourceId: s.id, namespace: s.namespace, label: s.label };
}

/**
 * Gekürzte Beispielantwort (ein Name, vier Quellen, Auszüge aus Markenvorbereitung und
 * Links). Aufgebaut mit denselben Funktionen wie die echte Antwort; die Quellenergebnisse
 * sind ausgedachte Beispielwerte, kein Prüfergebnis.
 */
export function exampleCheckResponse(): { ranking: ShortlistEntry[]; reports: NameReport[] } {
  const name = "wachwerk";
  const [de, com] = domainSources(["de", "com"]);
  const results: SourceResult[] = [
    { sourceId: de.id, namespace: de.namespace, label: de.label, target: `${name}.de`, status: "not_found", evidence: "RDAP HTTP 404" },
    { sourceId: com.id, namespace: com.namespace, label: com.label, target: `${name}.com`, status: "not_found", evidence: "RDAP HTTP 404" },
    { ...pick("npm"), target: name, status: "not_found", evidence: "HTTP 404", url: `https://www.npmjs.com/package/${name}` },
    { ...pick("appstore"), target: name, status: "unknown", evidence: "timeout", retryable: true },
  ];
  const verdict = computeVerdict(results);
  const full = trademarkPrep(name);
  const report: NameReport = {
    schemaVersion: 2,
    input: "Wachwerk",
    name,
    checkedAt: "2026-11-05T09:30:00.000Z",
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    counts: countStatuses(results),
    incomplete: results.filter((r) => r.status === "unknown").map((r) => r.label),
    results,
    trademark: {
      ...full,
      links: full.links.slice(0, 2),
      variants: full.variants.slice(0, 3),
      classes: full.classes.slice(0, 1),
      checklist: full.checklist.slice(0, 2),
    },
    manualLinks: manualSocialLinks(name).slice(0, 2),
  };
  return { ranking: rankReports([report]), reports: [report] };
}

// --- Schemas ----------------------------------------------------------------

function jsonSchema(schema: z.ZodType, io: "input" | "output"): JsonObject {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io }) as JsonObject;
  void _ignored;
  return rest;
}

function ref(name: string): JsonObject {
  return { $ref: `#/components/schemas/${name}` };
}

/** Liefert das Unterobjekt oder wirft: Ändert sich ein Schema, soll der Test es melden. */
function child(obj: JsonObject, key: string): JsonObject {
  const value = obj[key];
  if (!value || typeof value !== "object") throw new Error(`OpenAPI: ${key} fehlt im erzeugten Schema`);
  return value as JsonObject;
}

function requestSchema(): JsonObject {
  const schema = jsonSchema(checkBodySchema, "input");
  const props = child(schema, "properties");
  const names = child(props, "names");
  names.description = `Ein bis ${MAX_NAMES} Namen. Jeder wird normalisiert (Kleinbuchstaben, Umlaute ausgeschrieben, bekannte Endung abgetrennt); ein ungültiger Name lässt die ganze Anfrage scheitern, bevor eine Quelle abgefragt wird. Doppelte Namen nach der Normalisierung zählen einmal.`;

  const tlds = child(props, "tlds");
  tlds.description = `Endungen für den Namensraum domains, höchstens ${MAX_TLDS} verschiedene. Standard: ${DEFAULT_DOMAIN_TLDS.join(", ")}. Wer tlds angibt, bekommt Domainabfragen auch ohne den Namensraum domains. Gültig sind alle Endungen mit RDAP-Server im IANA-Bootstrap sowie at und eu; die vollständige Liste liefert GET /api/sources. Eine unbekannte Endung lässt die ganze Anfrage scheitern (400). Nur ${FEATURED_TLDS.length} Endungen sind einzeln geprüft; bei den übrigen ergibt RDAP-404 nie „nicht gefunden“, sondern „unknown“.`;
  tlds.default = [...DEFAULT_DOMAIN_TLDS];
  child(tlds, "items").pattern = "^\\.?[A-Za-z0-9]{2,63}$";

  const namespaces = child(props, "namespaces");
  namespaces.description = `Namensräume, deren Standardquellen geprüft werden. Standard: ${DEFAULT_NAMESPACES.join(", ")}. Im Namensraum social ist keine Quelle Standard: dort Quellen über sources wählen. Wirkt nicht, wenn sources gesetzt ist (Ausnahme: domains).`;
  namespaces.default = [...DEFAULT_NAMESPACES];
  child(namespaces, "items").enum = [...NAMESPACES];

  const sources = child(props, "sources");
  sources.description = `Ausdrückliche Quellen-IDs außerhalb von Domains. Sie ersetzen die Standardauswahl: Wer Zusatzquellen will, schickt die gewünschten Standardquellen mit (${DEFAULT_SOURCE_IDS.join(", ")}). Domains kommen weiter aus tlds und namespaces.`;
  child(sources, "items").enum = [...SOURCE_IDS];

  const profile = child(props, "profile");
  profile.description = `Fertige Auswahl zum Vorhaben. Setzt namespaces, sources und tlds in einem Wort; ausdrücklich angegebene tlds oder sources ersetzen den jeweiligen Teil, ausdrückliche namespaces behalten Quellen und Endungen des Profils nur in den gewählten Namensräumen. Die Kosten fürs Rate-Limit folgen der aufgelösten Auswahl. Ein unbekanntes Profil lässt die Anfrage scheitern (400). Profile: ${describeProfiles()} Die Liste liefert auch GET /api/sources.`;
  profile.enum = [...PROFILE_IDS];
  return schema;
}

function schemas(): JsonObject {
  const report = jsonSchema(NameReportSchema, "output");
  const reportProps = child(report, "properties");
  child(reportProps, "results").items = ref("SourceResult");
  reportProps.trademark = { ...ref("TrademarkPrep"), description: "Vorbereitung der Markenrecherche. Die Marke wird nie geprüft: status ist immer not_checked." };

  const sourceResult = jsonSchema(SourceResultSchema, "output");
  const register = child(child(sourceResult, "properties"), "register");
  register.description = `${String(register.description ?? "")}. Der Link führt zum eigenen, möglicherweise kostenpflichtigen Angebot des Betreibers dieser Instanz, an dem er verdienen kann; Markenfrei überträgt nichts an diesen Dienst. Ohne Einstellung des Betreibers fehlt das Feld immer.`;
  register.examples = [
    { label: "Registrieren über Beispiel-Domains", url: "https://example.org/bestellen?domain=wachwerk.de", notice: REGISTER_NOTICE },
  ];
  const status = child(child(sourceResult, "properties"), "status");
  status.description = `${String(status.description ?? "")} Texte der Oberfläche: ${Object.entries(STATUS_LABEL)
    .map(([k, v]) => `${k} = ${v}`)
    .join(", ")}.`.trim();

  return {
    CheckRequest: requestSchema(),
    CheckResponse: {
      type: "object",
      description: "Berichte in Eingabereihenfolge (reports) und dieselben Namen als Rangliste (ranking).",
      properties: {
        ranking: {
          type: "array",
          description: "Rangliste: ohne Treffer in allen gewählten Quellen zuerst, dann wenige Treffer, dann wenige unzulässige Namensräume, dann wenige Lücken.",
          items: ref("ShortlistEntry"),
        },
        reports: { type: "array", description: "Ein Bericht je verschiedenem Namen.", items: ref("NameReport") },
      },
      required: ["ranking", "reports"],
      additionalProperties: false,
      example: exampleCheckResponse(),
    },
    NameReport: report,
    SourceResult: sourceResult,
    TrademarkPrep: jsonSchema(TrademarkPrepSchema, "output"),
    ShortlistEntry: jsonSchema(ShortlistEntrySchema, "output"),
    Error: {
      type: "object",
      description: "Fehlerantwort mit einer deutschen Meldung. Die Meldung enthält nie Eingaben außer unbekannten Werten, die gekürzt zitiert werden.",
      properties: { error: { type: "string" } },
      required: ["error"],
      additionalProperties: false,
    },
    JsonRpcRequest: {
      type: "object",
      description: "JSON-RPC-2.0-Nachricht des Model Context Protocol (eine einzelne Nachricht, keine Batches).",
      properties: {
        jsonrpc: { const: "2.0" },
        id: { type: ["string", "integer"] },
        method: { type: "string", examples: ["initialize", "tools/list", "tools/call"] },
        params: { type: "object" },
      },
      required: ["jsonrpc", "method"],
    },
    JsonRpcResponse: {
      type: "object",
      description: "JSON-RPC-2.0-Antwort. Bei Fehlern steht error statt result.",
      properties: {
        jsonrpc: { const: "2.0" },
        id: { type: ["string", "integer", "null"] },
        result: { type: "object" },
        error: {
          type: "object",
          properties: { code: { type: "integer" }, message: { type: "string" } },
          required: ["code", "message"],
        },
      },
      required: ["jsonrpc"],
    },
    SourcesCatalog: jsonSchema(SourcesCatalogSchema, "output"),
    Health: {
      type: "object",
      properties: {
        status: { const: "ok" },
        version: { type: "string", description: "Produktversion (package.json)", examples: [APP_VERSION] },
      },
      required: ["status", "version"],
      additionalProperties: false,
    },
  };
}

// --- Antworten ----------------------------------------------------------------

function errorResponse(description: string, message: string, headers?: JsonObject): JsonObject {
  return {
    description,
    ...(headers ? { headers } : {}),
    content: {
      "application/json": { schema: ref("Error"), example: { error: message } },
    },
  };
}

const NO_STORE_HEADER = {
  "Cache-Control": { description: "Immer no-store: Antworten werden nicht zwischengespeichert.", schema: { type: "string", const: "no-store" } },
};

/**
 * RateLimit-Header der Antworten von /api/check und /api/mcp, die das Client-Limit betreffen
 * (Einzelheader früherer Fassungen von draft-ietf-httpapi-ratelimit-headers). Fehlen bei
 * gemeinsamem Zählschlüssel (siehe rate-limit.ts) und beim 429 des Prozesslimits.
 */
const RATE_LIMIT_HEADERS = {
  "RateLimit-Limit": { description: "Einheiten pro Fenster für diesen Client.", schema: { type: "integer", minimum: 1 } },
  "RateLimit-Remaining": {
    description: "Noch freie Einheiten im aktuellen Fenster, nach dieser Anfrage. Jeder verschiedene Name kostet mindestens eine Einheit.",
    schema: { type: "integer", minimum: 0 },
  },
  "RateLimit-Reset": { description: "Sekunden bis zum Ende des Fensters.", schema: { type: "integer", minimum: 1 } },
};

const RETRY_AFTER_HEADERS = {
  "Retry-After": { description: "Sekunden bis zum Ende des Fensters.", schema: { type: "integer", minimum: 1 } },
  ...RATE_LIMIT_HEADERS,
};

function checkOperation(): JsonObject {
  return {
    operationId: "checkNames",
    tags: ["Prüfung"],
    summary: "Namen in offenen Quellen prüfen",
    description: [
      `Prüft einen oder bis zu ${MAX_NAMES} Namen in Domains (RDAP), Paketregistern, App Stores, bekannten Namen und auf Wunsch weiteren Quellen. Dieselbe Engine wie Oberfläche und MCP-Server; kein LLM, die Anfrage wird nicht gespeichert.`,
      "",
      "**Was die Antwort bedeutet:** Jede Quelle liefert genau einen Status. `not_found` heißt, die Quelle kennt den Namen nicht; es heißt nie, der Name sei frei oder registrierbar. `unknown` (keine verwertbare Antwort) ist nie frei. Die Ampel `green` heißt nur, dass alle gewählten Quellen den Namen nicht kennen. Die Marke wird nicht geprüft: `trademark.status` ist immer `not_checked`; die Antwort enthält nur Links und Vorbereitung für die Recherche. Keine Rechtsberatung.",
      "",
      "**Profile:** `profile` (z. B. `npm`, `python`, `web-app`) wählt Namensräume, Quellen und Endungen in einem Wort; die Liste steht unter GET /api/sources.",
      "",
      "**Registrierungs-Link:** Hat der Betreiber einen Registrierungsdienst eingestellt, tragen Domain-Zeilen einzeln geprüfter Endungen mit `not_found` das Feld `register` (`label`, `url`, `notice`). Das ist ein eigenes, möglicherweise kostenpflichtiges Angebot des Betreibers, an dem er verdienen kann, und keine Zusage, dass die Domain bestellbar ist. Ohne Einstellung fehlt das Feld.",
      "",
      `**Grenzen:** höchstens ${MAX_NAMES} Namen, Body höchstens ${CHECK_MAX_BODY_BYTES / 1024} KB, Content-Type \`application/json\`. Pro Client (IP) gelten standardmäßig ${DEFAULT_RATE_LIMIT} Einheiten pro Minute; jeder verschiedene Name zählt eine Einheit, eine größere Quellenauswahl kostet ein Vielfaches (Namen × aufgerundet aufgelöste Quellen / Quellen der Standardauswahl). Eindeutige Quellenantworten hält der Server ${CACHE_TTL_SECONDS / 60} Minuten im Arbeitsspeicher. Gedacht für Einzelabfragen, die ein Mensch auslöst, nicht für Massenabfragen.`,
      "",
      "**Browser:** Es gibt kein CORS. Aufrufe aus Browserseiten fremder Herkunft werden mit 403 abgelehnt; Aufrufe ohne Origin-Header (curl, Server, Skripte) sind erlaubt.",
    ].join("\n"),
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: ref("CheckRequest"),
          examples: {
            einzelnerName: { summary: "Ein Name mit Standardauswahl", value: EXAMPLE_CHECK_REQUESTS.single },
            shortlist: { summary: "Shortlist mit Standardauswahl", value: EXAMPLE_CHECK_REQUESTS.shortlist },
            auswahl: { summary: "Endungen, Namensräume und Quellen wählen", value: EXAMPLE_CHECK_REQUESTS.selection },
            profil: { summary: "Profil für ein npm-Paket", value: EXAMPLE_CHECK_REQUESTS.profile },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Berichte und Rangliste.",
        headers: { ...NO_STORE_HEADER, ...RATE_LIMIT_HEADERS },
        content: { "application/json": { schema: ref("CheckResponse") } },
      },
      "400": errorResponse(
        "Ungültige Anfrage: kaputtes JSON, falsche Typen, keine oder zu viele Namen, ungültiger Name, unbekannte Endung, Quelle oder Namensraum, oder die Kosten der Anfrage übersteigen das Limit pro Fenster (dann hilft kein Wiederholen; weniger Namen oder Quellen wählen). Die Meldung nennt den Grund. Nach der Rate-Limit-Prüfung erzeugte Fehler tragen die RateLimit-Header.",
        `Höchstens ${MAX_NAMES} Namen pro Anfrage.`,
        NO_STORE_HEADER,
      ),
      "403": errorResponse("Aufruf aus einer fremden Browserseite (Origin nicht erlaubt).", CHECK_ERRORS.forbidden, NO_STORE_HEADER),
      "413": errorResponse(`Body größer als ${CHECK_MAX_BODY_BYTES / 1024} KB.`, CHECK_ERRORS.tooLarge, NO_STORE_HEADER),
      "415": errorResponse("Content-Type ist nicht application/json.", CHECK_ERRORS.contentType, NO_STORE_HEADER),
      "429": errorResponse(
        "Rate-Limit erreicht. Retry-After nennt die Sekunden bis zum nächsten Fenster.",
        rateLimitMessage(12),
        RETRY_AFTER_HEADERS,
      ),
      "500": errorResponse("Unerwarteter Fehler (allgemeine Meldung, keine Details).", CHECK_ERRORS.failed, NO_STORE_HEADER),
    },
  };
}

function mcpOperation(serverUrl: string): JsonObject {
  const rpcExample = (code: number, message: string) => ({ jsonrpc: "2.0", error: { code, message }, id: null });
  return {
    operationId: "mcp",
    tags: ["Agenten"],
    summary: "MCP-Endpunkt (Streamable HTTP)",
    description: [
      `Model Context Protocol über Streamable HTTP, zustandslos, Antworten als JSON, derselbe Server wie bei stdio. Einrichtung für Claude Code, Claude Desktop und Cursor: ${new URL("/mcp", serverUrl).toString()}. Dieser Pfad ist kein REST-Endpunkt; Clients sprechen JSON-RPC 2.0 (initialize, tools/list, tools/call).`,
      "",
      "Tools: `markenfrei_check_name`, `markenfrei_check_names`, `markenfrei_trademark_prep`, `markenfrei_suggest_names`. Es gelten dieselben Regeln wie bei /api/check: not_found ist nie frei, unknown ist nie frei, die Marke wird nicht geprüft.",
      "",
      "Der Origin-Header muss fehlen (Kommandozeile, Server) oder zu den konfigurierten Origins oder localhost gehören. Keine Batches. Body höchstens 64 KB. Rate-Limit wie bei /api/check, Prüf-Tools kosten Namen × Quellenumfang, alles andere 1. GET liefert 405.",
    ].join("\n"),
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: ref("JsonRpcRequest"),
          example: {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "markenfrei_check_name", arguments: { name: "wachwerk" } },
          },
        },
      },
    },
    responses: {
      "200": { description: "JSON-RPC-Antwort.", headers: RATE_LIMIT_HEADERS, content: { "application/json": { schema: ref("JsonRpcResponse") } } },
      "400": {
        description: "Batch-Anfrage, nicht lesbarer Body oder Kosten über dem Limit pro Fenster (JSON-RPC-Fehler -32600).",
        content: { "application/json": { schema: ref("JsonRpcResponse"), example: rpcExample(-32600, "Batch-Anfragen werden nicht unterstützt.") } },
      },
      "403": {
        description: "Origin nicht erlaubt (JSON-RPC-Fehler -32000).",
        content: { "application/json": { schema: ref("JsonRpcResponse"), example: rpcExample(-32000, "Origin nicht erlaubt.") } },
      },
      "413": {
        description: "Body größer als 64 KB (JSON-RPC-Fehler -32600).",
        content: { "application/json": { schema: ref("JsonRpcResponse"), example: rpcExample(-32600, "Anfrage zu groß (höchstens 64 KB).") } },
      },
      "429": errorResponse(
        "Rate-Limit erreicht.",
        rateLimitMessage(12),
        RETRY_AFTER_HEADERS,
      ),
    },
  };
}

function healthOperation(): JsonObject {
  return {
    operationId: "health",
    tags: ["Betrieb"],
    summary: "Lebenszeichen für Monitoring",
    description: "Billig und ohne Abfragen bei Dritten, ohne Rate-Limit und ohne Geheimnisse. Sagt nur, dass der Serverprozess antwortet, nicht, ob die abgefragten Dienste erreichbar sind.",
    responses: {
      "200": {
        description: "Der Prozess läuft.",
        headers: NO_STORE_HEADER,
        content: { "application/json": { schema: ref("Health"), example: { status: "ok", version: APP_VERSION } } },
      },
    },
  };
}

function sourcesOperation(): JsonObject {
  return {
    operationId: "listSources",
    tags: ["Prüfung"],
    summary: "Quellen, Namensräume und Endungen auflisten",
    description:
      "Die gültigen Werte für `sources`, `namespaces`, `tlds` und `profile` von POST /api/check, dazu welche zur Standardprüfung gehören, und ob der Betreiber einen Registrierungs-Link eingestellt hat (nur ja/nein und der Name des Dienstes). Keine Abfragen bei Dritten, kein Rate-Limit. Achtung: `sources` ersetzt die Standardquellen außerhalb von Domains; wer Zusatzquellen will, schickt die Quellen mit `default: true` mit.",
    responses: {
      "200": {
        description: "Der Katalog.",
        headers: {
          "Cache-Control": { description: `Eine Stunde zwischenspeicherbar.`, schema: { type: "string", const: `public, max-age=${SOURCES_MAX_AGE_SECONDS}` } },
        },
        content: { "application/json": { schema: ref("SourcesCatalog"), example: buildSourcesCatalog(null) } },
      },
    },
  };
}

/** Das vollständige OpenAPI-3.1-Dokument. serverUrl ist die öffentliche Adresse der Instanz. */
export function buildOpenApiDocument(serverUrl: string = DEFAULT_PUBLIC_URL): JsonObject {
  const base = serverUrl.replace(/\/+$/, "");
  return {
    openapi: "3.1.0",
    info: {
      title: "Markenfrei API",
      version: APP_VERSION,
      summary: "Namen vorprüfen: Domains, Pakete, App Stores, bekannte Namen",
      description: [
        "Deterministische Vorprüfung eines Namens in offenen Quellen, ohne Konto und ohne Schlüssel. Kein LLM; Suchanfragen werden nicht gespeichert.",
        "",
        "Wichtig: Grün heißt nicht „frei“. `not_found` heißt nur, dass die Quelle den Namen nicht kennt, `unknown` ist nie frei, und die Marke wird nicht geprüft. Vorprüfung, keine Rechtsberatung.",
        "",
        `Faire Nutzung: Einzelabfragen, die ein Mensch auslöst, keine Massenabfragen. Standard-Limit ${DEFAULT_RATE_LIMIT} Einheiten pro ${RATE_LIMIT_WINDOW_MS / 1000} Sekunden und IP.`,
        "",
        `Dokumentation: ${base}/api-docs`,
      ].join("\n"),
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: base, description: "Diese Instanz" }],
    tags: [
      { name: "Prüfung", description: "Namen prüfen" },
      { name: "Agenten", description: "Model Context Protocol" },
      { name: "Betrieb", description: "Monitoring" },
    ],
    externalDocs: { description: "API für Entwickler", url: `${base}/api-docs` },
    paths: {
      "/api/check": { post: checkOperation() },
      "/api/sources": { get: sourcesOperation() },
      "/api/mcp": { post: mcpOperation(base) },
      "/api/health": { get: healthOperation() },
    },
    components: { schemas: schemas() },
    "x-markenfrei": {
      namespaces: Object.fromEntries(NAMESPACES.map((n) => [n, NAMESPACE_LABEL[n]])),
      defaultNamespaces: [...DEFAULT_NAMESPACES],
      defaultTlds: [...DEFAULT_DOMAIN_TLDS],
      defaultSources: DEFAULT_SOURCE_IDS,
      profiles: [...PROFILE_IDS],
      statuses: STATUSES,
      verdicts: VERDICTS,
      limits: {
        maxNames: MAX_NAMES,
        maxTlds: MAX_TLDS,
        maxBodyBytes: CHECK_MAX_BODY_BYTES,
        rateLimitPerWindow: DEFAULT_RATE_LIMIT,
        rateLimitWindowSeconds: RATE_LIMIT_WINDOW_MS / 1000,
        nameMaxLength: CHECK_LIMITS.nameMaxLength,
      },
    },
  };
}
