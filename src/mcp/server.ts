import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  CheckInputError,
  checkName,
  checkNames,
  DEFAULT_NAMESPACES,
  MAX_NAMES,
  MAX_TLDS,
  STATIC_SOURCES,
  type CheckOptions,
  type NameReport,
} from "@/lib/engine/check";
import {
  NameReportSchema,
  NamespaceSchema,
  ShortlistEntrySchema,
  TrademarkPrepSchema,
} from "@/lib/engine/report-schema";
import { DEFAULT_DOMAIN_TLDS, DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { trademarkPrep, type TrademarkPrep } from "@/lib/engine/trademark-prep";
import { NAMESPACE_LABEL, NAMESPACES } from "@/lib/engine/types";
import { STATUS_LABEL, type ShortlistEntry, type Verdict } from "@/lib/engine/verdict";
import { normalizeName } from "@/lib/name";
import { discoverOpenDataWords } from "@/lib/opendata";

export const MCP_SERVER_VERSION = "2.0.0";

export const TOOL_NAMES = [
  "markenfrei_check_name",
  "markenfrei_check_names",
  "markenfrei_trademark_prep",
  "markenfrei_suggest_names",
] as const;

const SERVER_INSTRUCTIONS = [
  "Markenfrei prüft Namen deterministisch in offenen Quellen: Domains (RDAP), Paketregister, App Stores, bekannte Namen und auf Wunsch Social-Plattformen. Kein LLM, keine Speicherung der Anfragen.",
  "Status je Quelle: taken = vergeben; not_found = die Quelle kennt den Namen nicht (das heißt nicht registrierbar); similar = ähnlicher Treffer; invalid = dort nicht zulässig; unknown = keine verwertbare Antwort. unknown nie als frei werten.",
  "Ampel je Name: green (Keine Treffer) heißt nur, dass die geprüften Quellen nichts gefunden haben. Das ist keine Markenfreigabe.",
  "Markenregister werden nicht abgefragt, die Marke ist immer „nicht geprüft“. Die Recherche mit markenfrei_trademark_prep vorbereiten und dem Menschen die Links und den DPMA-Suchstring geben.",
  "Beim Benennen: Kandidaten selbst erzeugen oder markenfrei_suggest_names nutzen, dann alle zusammen mit markenfrei_check_names prüfen (bis 10 Namen).",
].join("\n");

const STATUS_HELP =
  "Status je Quelle: taken = vergeben, not_found = nicht gefunden (heißt nicht registrierbar), similar = ähnlich, invalid = nicht zulässig, unknown = keine Antwort (nie als frei werten). Ampel: green = keine Treffer in den geprüften Quellen, yellow = Treffer oder Lücken prüfen, red = vergeben. Grün ist keine Markenfreigabe: Markenregister werden nicht abgefragt.";

// --- Eingaben ---------------------------------------------------------------

const SOURCE_IDS = STATIC_SOURCES.map((s) => s.id) as [string, ...string[]];
const DEFAULT_SOURCE_IDS = STATIC_SOURCES.filter((s) => s.defaultEnabled).map((s) => s.id);

const nameField = z
  .string()
  .min(2, { error: "Der Name braucht mindestens 2 Zeichen." })
  .max(63, { error: "Der Name darf höchstens 63 Zeichen lang sein." });

const checkFields = {
  namespaces: z
    .array(NamespaceSchema)
    .optional()
    .describe(
      `Namensräume (Standard: ${DEFAULT_NAMESPACES.join(", ")}). Erlaubt: ${NAMESPACES.map((n) => `${n} (${NAMESPACE_LABEL[n]})`).join(", ")}.`,
    ),
  tlds: z
    .array(z.enum(DOMAIN_TLDS as unknown as [string, ...string[]]))
    .max(MAX_TLDS, { error: `Höchstens ${MAX_TLDS} Endungen pro Anfrage.` })
    .optional()
    .describe(`Domain-Endungen ohne Punkt, höchstens ${MAX_TLDS} (Standard: ${DEFAULT_DOMAIN_TLDS.join(", ")}).`),
  sources: z
    .array(z.enum(SOURCE_IDS))
    .optional()
    .describe(
      `Ausdrückliche Quellen statt der Standardauswahl außerhalb von Domains (Standard: ${DEFAULT_SOURCE_IDS.join(", ")}). Alle: ${STATIC_SOURCES.map((s) => `${s.id} (${s.label})`).join(", ")}.`,
    ),
};

// --- Ausgaben ---------------------------------------------------------------

export const CheckNamesOutputSchema = z.object({
  ranking: z.array(ShortlistEntrySchema).describe("Frei in allen gewählten Quellen zuerst, dann wenige Treffer, dann wenige Lücken"),
  reports: z.array(NameReportSchema),
});

export const TrademarkPrepOutputSchema = TrademarkPrepSchema.extend({
  name: z.string().describe("Normalisierter Name"),
});

export const SuggestNamesOutputSchema = z.object({
  keywords: z.array(z.string()),
  checked: z.literal(false).describe("Die Kandidaten sind ungeprüft"),
  note: z.string(),
  candidates: z.array(z.object({ name: z.string(), origin: z.string(), category: z.string() })),
  sourcesQueried: z.array(z.string()),
});

// --- Texte ------------------------------------------------------------------

const VERDICT_WORD: Record<Verdict, string> = { green: "GRÜN", yellow: "GELB", red: "ROT" };
const NOTE_MAX = 60;

function shortNote(note: string | undefined): string {
  if (!note) return "";
  const n = note.replace(/\s+/g, " ").trim();
  return ` (${n.length > NOTE_MAX ? `${n.slice(0, NOTE_MAX - 1)}…` : n})`;
}

/** Kompakter Bericht, eine Zeile je Namensraum. */
export function formatReport(report: NameReport): string {
  const lines = [`${report.name}: ${VERDICT_WORD[report.verdict]} (${report.verdictLabel})`];
  for (const ns of NAMESPACES) {
    const rows = report.results.filter((r) => r.namespace === ns);
    if (rows.length === 0) continue;
    // Hinweise nur bei "ähnlich" und "nicht zulässig"; Lücken stehen gesammelt in einer eigenen Zeile.
    const parts = rows.map(
      (r) => `${r.label} ${STATUS_LABEL[r.status]}${r.status === "similar" || r.status === "invalid" ? shortNote(r.note) : ""}`,
    );
    lines.push(`${NAMESPACE_LABEL[ns]}: ${parts.join(" | ")}`);
  }
  if (report.incomplete.length > 0) {
    lines.push(`Lücken: ${report.incomplete.join(", ")} (keine verwertbare Antwort, nicht als frei werten)`);
  }
  lines.push("Marke: nicht geprüft → markenfrei_trademark_prep");
  return lines.join("\n");
}

function formatRanking(ranking: ShortlistEntry[]): string {
  const lines = [`Rangliste (${ranking.length} ${ranking.length === 1 ? "Name" : "Namen"}, frei in allen gewählten Quellen zuerst):`];
  ranking.forEach((e, i) => {
    let line = `${i + 1}. ${e.name}: ${VERDICT_WORD[e.verdict]}`;
    if (e.taken.length > 0) line += ` · vergeben: ${e.taken.join(", ")}`;
    if (e.unknown.length > 0) line += ` · Lücken: ${e.unknown.join(", ")}`;
    lines.push(line);
  });
  lines.push("Grün heißt nur: in den geprüften Quellen nichts gefunden. Marke: nicht geprüft → markenfrei_trademark_prep");
  return lines.join("\n");
}

function formatTrademarkPrep(name: string, prep: TrademarkPrep): string {
  return [
    `${name}: Marke nicht geprüft. ${prep.note}`,
    "",
    "Recherche-Links:",
    ...prep.links.map((l) => `- ${l.label}: ${l.url}`),
    "",
    `DPMA-Expertensuchstring: ${prep.dpmaExpertQuery}`,
    `Schreibvarianten: ${prep.variants.length > 0 ? prep.variants.join(", ") : "keine"}`,
    `Klassen: ${prep.classes.map((c) => `${c.number} (${c.title})`).join("; ") || "keine"}`,
    "",
    "Checkliste:",
    ...prep.checklist.map((c, i) => `${i + 1}. ${c}`),
  ].join("\n");
}

// --- Ergebnisse -------------------------------------------------------------

function ok(text: string, structured: object): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: structured as Record<string, unknown>,
  };
}

function toolError(err: unknown): CallToolResult {
  const text =
    err instanceof CheckInputError
      ? `Eingabefehler: ${err.message}`
      : `Interner Fehler: ${err instanceof Error ? err.message : String(err)}`;
  return { isError: true, content: [{ type: "text", text }] };
}

export type MarkenfreiServerOptions = Pick<CheckOptions, "fetchImpl" | "now" | "contact">;

export function createMarkenfreiMcpServer(opts: MarkenfreiServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: "markenfrei", title: "Markenfrei", version: MCP_SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "markenfrei_check_name",
    {
      title: "Namen prüfen",
      description: `Prüft einen Namen, bevor ein Projekt, Paket, Repo, App-Eintrag oder eine Domain angelegt wird: Domains per RDAP, Paketregister (npm, PyPI, GitHub, crates.io, Homebrew), App Stores und bekannte Namen (Marken-Heuristik, Wikidata, GLEIF). Liefert eine Ampel, je Quelle einen Status mit Link zum Nachprüfen und die Vorbereitung der Markenrecherche. ${STATUS_HELP} Für mehrere Kandidaten markenfrei_check_names verwenden.`,
      inputSchema: {
        name: nameField.describe("Der zu prüfende Name, z. B. wachwerk. Umlaute werden ausgeschrieben, eine angehängte Endung entfernt."),
        ...checkFields,
      },
      outputSchema: NameReportSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ name, namespaces, tlds, sources }) => {
      try {
        const report = await checkName(name, { ...opts, namespaces, tlds, sources });
        return ok(formatReport(report), report);
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "markenfrei_check_names",
    {
      title: "Shortlist prüfen",
      description: `Prüft bis zu ${MAX_NAMES} Kandidaten in denselben Quellen wie markenfrei_check_name und sortiert sie: frei in allen gewählten Quellen zuerst, dann wenige Treffer, dann wenige Lücken. Gedacht für die Namenssuche: Kandidaten erzeugen (selbst oder mit markenfrei_suggest_names) und hier gesammelt prüfen. ${STATUS_HELP}`,
      inputSchema: {
        names: z
          .array(nameField)
          .min(1, { error: "Bitte mindestens einen Namen angeben." })
          .max(MAX_NAMES, { error: `Höchstens ${MAX_NAMES} Namen pro Anfrage.` })
          .describe(`1 bis ${MAX_NAMES} Namen`),
        ...checkFields,
      },
      outputSchema: CheckNamesOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ names, namespaces, tlds, sources }) => {
      try {
        const result = await checkNames(names, { ...opts, namespaces, tlds, sources });
        return ok(formatRanking(result.ranking), result);
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "markenfrei_trademark_prep",
    {
      title: "Markenrecherche vorbereiten",
      description:
        "Bereitet die Markenrecherche ohne Netzabfrage vor: Links zu DPMAregister, TMview, EUIPO, WIPO, TMDB und USPTO, ein DPMA-Expertensuchstring, Schreibvarianten, Nizza-Klassen und eine Checkliste. Markenfrei fragt keine Markenregister ab; das Ergebnis ist eine Anleitung für den Menschen, keine Freigabe. Verwenden, sobald ein Name in die engere Wahl kommt.",
      inputSchema: {
        name: nameField.describe("Der Name, für den die Recherche vorbereitet wird"),
        classes: z
          .array(
            z
              .number()
              .int({ error: "Klassen sind ganze Zahlen." })
              .min(1, { error: "Nizza-Klassen reichen von 1 bis 45." })
              .max(45, { error: "Nizza-Klassen reichen von 1 bis 45." }),
          )
          .max(45)
          .optional()
          .describe("Nizza-Klassen 1 bis 45; ohne Angabe ein Vorschlag (z. B. 9 und 42 für Software)"),
      },
      outputSchema: TrademarkPrepOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ name, classes }) => {
      const n = normalizeName(name);
      if (!n.ok) return toolError(new CheckInputError(n.error));
      const prep = trademarkPrep(n.name, { classes });
      return ok(formatTrademarkPrep(n.name, prep), { name: n.name, ...prep });
    },
  );

  server.registerTool(
    "markenfrei_suggest_names",
    {
      title: "Namen vorschlagen",
      description:
        "Erzeugt Namenskandidaten (Kunstwörter, Portmanteaus) aus einem Wortfeld zu den Stichwörtern (OpenThesaurus, Datamuse, feste Regeln, kein LLM). Die Kandidaten sind ungeprüft: anschließend mit markenfrei_check_names prüfen.",
      inputSchema: {
        keywords: z
          .array(z.string().min(2, { error: "Stichwörter brauchen mindestens 2 Zeichen." }).max(40))
          .min(1, { error: "Bitte mindestens ein Stichwort angeben." })
          .max(6, { error: "Höchstens 6 Stichwörter." })
          .describe("1 bis 6 Stichwörter zum Projekt, z. B. [\"schicht\", \"planung\"]"),
        count: z.number().int().min(1).max(20).default(10).describe("Anzahl der Kandidaten, 1 bis 20 (Standard 10)"),
      },
      outputSchema: SuggestNamesOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ keywords, count }) => {
      try {
        const field = await discoverOpenDataWords({ keywords, maxLen: 12 });
        const candidates = field.synthesizedCandidates.slice(0, count);
        const note = "Ungeprüft, mit markenfrei_check_names prüfen.";
        const text = [
          `${candidates.length} Kandidaten zu ${keywords.join(", ")} (${note})`,
          ...candidates.map((c, i) => `${i + 1}. ${c.name}: ${c.origin}`),
        ].join("\n");
        return ok(text, { keywords, checked: false, note, candidates, sourcesQueried: field.sourcesQueried });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  return server;
}
