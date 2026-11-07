import { DEFAULT_NAMESPACES, MAX_NAMES, MAX_TLDS, STATIC_SOURCES } from "@/lib/engine/check";
import { DEFAULT_DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { TOOL_NAMES } from "@/mcp/server";
import { DEFAULT_RATE_LIMIT, RATE_LIMIT_WINDOW_MS } from "@/lib/rate-limit";

/**
 * Inhalt von /llms.txt: eine kurze, für Sprachmodelle und Agenten lesbare Beschreibung (llmstxt.org).
 * Zahlen und Listen kommen aus dem Code, damit der Text nicht von der Schnittstelle abweicht.
 */
export function buildLlmsTxt(origin: string): string {
  const base = origin.replace(/\/+$/, "");
  const defaults = STATIC_SOURCES.filter((s) => s.defaultEnabled).map((s) => s.id);
  return [
    "# Markenfrei",
    "",
    "> Vorprüfung für Namen: Domains (RDAP), Paketregister, App Stores und bekannte Namen in einem Durchgang, mit Ampel und Link zu jeder Quelle. Deterministisch, ohne LLM, ohne Konto, ohne Schlüssel. Keine Markenprüfung und keine Rechtsberatung.",
    "",
    "Wichtig für die Auswertung: Grün heißt nur, dass in den gewählten Quellen nichts gefunden wurde. Es heißt nicht „als Marke frei“ und nicht „registrierbar“. `unknown` ist nie frei. Die Marke steht immer auf „nicht geprüft“; die Antwort enthält die Vorbereitung für DPMA, EUIPO und WIPO.",
    "",
    "## Schnittstellen",
    "",
    `- [MCP-Server (Streamable HTTP)](${base}/api/mcp): Tools ${TOOL_NAMES.join(", ")}. Einrichtung: ${base}/mcp`,
    `- [POST /api/check](${base}/api-docs): JSON { "names": ["wachwerk"] }, bis zu ${MAX_NAMES} Namen. Optional tlds (höchstens ${MAX_TLDS}), namespaces, sources.`,
    `- [GET /api/sources](${base}/api/sources): alle gültigen Quellen-IDs, Namensräume und Endungen als JSON`,
    `- [OpenAPI 3.1](${base}/api/openapi.json)`,
    `- [Quellen und Grenzen](${base}/quellen)`,
    "",
    "## Standardprüfung",
    "",
    `- Namensräume: ${DEFAULT_NAMESPACES.join(", ")}`,
    `- Endungen: ${DEFAULT_DOMAIN_TLDS.map((t) => `.${t}`).join(", ")}`,
    `- Quellen außerhalb von Domains: ${defaults.join(", ")}`,
    "- `sources` ersetzt die Standardquellen außerhalb von Domains. Zusatzquellen: die Standardquellen-IDs mitschicken.",
    "",
    "## Grenzen",
    "",
    `- Einzelabfragen für ein konkretes Projekt, keine Massenabfragen. Rate-Limit ${DEFAULT_RATE_LIMIT} Einheiten pro ${RATE_LIMIT_WINDOW_MS / 1000} Sekunden und IP (jeder Name eine Einheit).`,
    "- Eine Prüfung dauert höchstens etwa 8 Sekunden. Quellen, die nicht rechtzeitig antworten, melden `unknown` (mit `retryable: true`, wenn ein erneuter Versuch sinnvoll ist).",
    "- Jede Antwort nennt den Stand in den Headern RateLimit-Limit, RateLimit-Remaining und RateLimit-Reset; bei 429 gilt Retry-After.",
    "- Aufrufe aus Browserseiten fremder Herkunft werden abgelehnt (403); Server, Skripte und curl funktionieren.",
    "",
  ].join("\n");
}
