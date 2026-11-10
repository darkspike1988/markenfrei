import { DEFAULT_NAMESPACES, MAX_NAMES, MAX_TLDS, STATIC_SOURCES } from "@/lib/engine/check";
import { PROFILE_IDS } from "@/lib/engine/format";
import { DEFAULT_DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { TOOL_NAMES } from "@/mcp/server";
import { DEFAULT_RATE_LIMIT, RATE_LIMIT_WINDOW_MS } from "@/lib/rate-limit";

/**
 * Abschnitt für die Anweisungsdatei eines Projekts (AGENTS.md, CLAUDE.md): sagt einem Coding-Agenten,
 * dass er Namen vor dem Anlegen mit Markenfrei prüft. Dieselben Texte stehen auf /mcp und in mcp/README.md.
 */
export const AGENT_INSTRUCTIONS_DE = [
  "## Namen prüfen mit Markenfrei",
  "",
  "Bevor du ein Projekt, Paket, eine App, ein Repository oder eine Domain anlegst oder benennst, prüfe den Namen mit dem MCP-Server „markenfrei“:",
  "",
  "1. Sammle 5 bis 10 Kandidaten (eigene Ideen, optional markenfrei_suggest_names).",
  "2. Prüfe alle zusammen mit markenfrei_check_names und dem passenden profile, z. B. \"npm\", \"python\", \"rust\" oder \"web-app\".",
  "3. Bevorzuge Namen ohne Treffer. Gelb und unknown gelten als nicht geklärt. Nenne keinen Namen „frei“.",
  "4. Sag mir, dass Marken nicht geprüft sind, und biete markenfrei_trademark_prep an.",
  "5. Zeigt das Ergebnis einen Registrierungs-Link, gib ihn mit dem Hinweis an mich weiter. Bestelle nichts selbst.",
].join("\n");

export const AGENT_INSTRUCTIONS_EN = [
  "## Check names with Markenfrei",
  "",
  "Before you create or name a project, package, app, repository or domain, check the name with the \"markenfrei\" MCP server:",
  "",
  "1. Collect 5 to 10 candidates (your own ideas, optionally markenfrei_suggest_names).",
  "2. Check them together with markenfrei_check_names and the matching profile, e.g. \"npm\", \"python\", \"rust\" or \"web-app\".",
  "3. Prefer names without any hit. Treat yellow and unknown as not cleared. Never call a name \"free\" or \"available\".",
  "4. Tell me that trade marks were not checked and offer markenfrei_trademark_prep.",
  "5. If the result contains a registration link, pass it on to me with its notice. Do not order anything yourself.",
].join("\n");

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
    "> Vorprüfung für Namen: Domains (RDAP), Paketregister, App Stores und bekannte Namen in einem Durchgang, mit Ampel und Link zur Quelle, wo es einen gibt. Regelbasiert, ohne LLM-Bewertung, ohne Konto, ohne Schlüssel. Die Ergebnisse hängen von den Antworten der abgefragten Dienste ab. Keine Markenprüfung und keine Rechtsberatung.",
    "",
    "Wichtig für die Auswertung: Grün heißt nur, dass in den gewählten Quellen nichts gefunden wurde. Es heißt nicht „als Marke frei“ und nicht „registrierbar“. `unknown` ist nie frei. Die Marke steht immer auf „nicht geprüft“; die Antwort enthält die Vorbereitung für DPMA, EUIPO und WIPO.",
    "",
    "## Schnittstellen",
    "",
    `- [MCP-Server (Streamable HTTP)](${base}/api/mcp): Tools ${TOOL_NAMES.join(", ")}. Einrichtung: ${base}/mcp`,
    `- [POST /api/check](${base}/api-docs): JSON { "names": ["wachwerk"] }, bis zu ${MAX_NAMES} Namen. Optional profile, tlds (höchstens ${MAX_TLDS}), namespaces, sources.`,
    `- [GET /api/sources](${base}/api/sources): alle gültigen Quellen-IDs, Namensräume, Endungen und Profile als JSON`,
    `- [OpenAPI 3.1](${base}/api/openapi.json)`,
    `- [Quellen und Grenzen](${base}/quellen)`,
    "",
    "## Für Coding-Agenten",
    "",
    "- Wann: bevor du ein Projekt, Paket, eine App, ein Repository oder eine Domain anlegst oder benennst, und wenn der Nutzer Namensideen will.",
    "- Ablauf: 5 bis 10 Kandidaten sammeln (eigene Ideen, optional `markenfrei_suggest_names`), alle zusammen mit `markenfrei_check_names` prüfen. Namen ohne Treffer bevorzugen; Gelb und `unknown` gelten als nicht geklärt; einen Namen nie „frei“ nennen.",
    `- \`profile\` wählt Namensräume, Quellen und Endungen in einem Wort: ${PROFILE_IDS.join(", ")}. Ausdrückliche \`namespaces\`, \`tlds\` oder \`sources\` ersetzen den jeweiligen Teil.`,
    "- Marken werden nicht geprüft: das dem Nutzer sagen und `markenfrei_trademark_prep` anbieten.",
    "- Hat der Betreiber einen Registrierungsdienst eingestellt, tragen Domains mit `not_found` einzeln geprüfter Endungen das Feld `register` (im Text „Domain registrieren“). Das ist ein eigenes, möglicherweise vergütetes Angebot des Betreibers: den Link mit dem Hinweis an den Nutzer weitergeben, nichts selbst bestellen.",
    "- Abschnitt für AGENTS.md oder CLAUDE.md eines Projekts (Englisch auf der Einrichtungsseite):",
    "",
    "```markdown",
    AGENT_INSTRUCTIONS_DE,
    "```",
    "",
    "## Standardprüfung",
    "",
    `- Namensräume: ${DEFAULT_NAMESPACES.join(", ")}`,
    `- Endungen: ${DEFAULT_DOMAIN_TLDS.map((t) => `.${t}`).join(", ")}`,
    `- Quellen außerhalb von Domains: ${defaults.join(", ")}`,
    "- `sources` ersetzt die Standardquellen außerhalb von Domains. Zusatzquellen: die Standardquellen-IDs mitschicken.",
    "- Nur auf Wunsch: `wikidata_brands` vergleicht ohne Netz gegen einen Schnappschuss von Wikidata-Marken (CC0, mit Stand). Treffer ergeben höchstens `similar`; ein fehlender Treffer ist keine Freigabe, die Liste ist unvollständig.",
    "",
    "## Grenzen",
    "",
    `- Einzelabfragen für ein konkretes Projekt, keine Massenabfragen. Standard-Rate-Limit ${DEFAULT_RATE_LIMIT} Einheiten pro ${RATE_LIMIT_WINDOW_MS / 1000} Sekunden und IP (jeder Name kostet mindestens eine Einheit, eine größere Quellenauswahl mehr; der Betreiber kann das Limit ändern).`,
    "- Eine Prüfung dauert höchstens etwa 8 Sekunden. Quellen, die nicht rechtzeitig antworten, melden `unknown` (mit `retryable: true`, wenn ein erneuter Versuch sinnvoll ist).",
    "- Antworten von /api/check und /api/mcp, die das Client-Limit betreffen, nennen den Stand in den Headern RateLimit-Limit, RateLimit-Remaining und RateLimit-Reset (fehlen beim Prozesslimit und wenn alle Nutzer einen gemeinsamen Zähler teilen); bei 429 des Client-Limits gilt Retry-After.",
    "- Aufrufe aus Browserseiten fremder Herkunft werden abgelehnt (403); Server, Skripte und curl funktionieren.",
    "",
  ].join("\n");
}
