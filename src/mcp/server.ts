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
  ShortlistReportSchema,
  TrademarkPrepSchema,
} from "@/lib/engine/report-schema";
import { DEFAULT_DOMAIN_TLDS, isDomainTld } from "@/lib/engine/sources/domains";
import { trademarkPrep, type TrademarkPrep } from "@/lib/engine/trademark-prep";
import { NAMESPACE_LABEL, NAMESPACES, type Namespace, type SourceResult } from "@/lib/engine/types";
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
  "Status je Quelle: taken = vergeben; not_found = die Quelle kennt den Namen nicht, das heißt nicht, dass er frei oder registrierbar ist; similar = ähnlicher Treffer; invalid = dort nicht zulässig; unknown = keine verwertbare Antwort. unknown nie als frei werten.",
  "Ampel je Name: green (Keine Treffer) heißt nur, dass die geprüften Quellen nichts gefunden haben. Das ist keine Markenfreigabe.",
  "Markenregister werden nicht abgefragt, die Marke ist immer „nicht geprüft“. Die Recherche mit markenfrei_trademark_prep vorbereiten und dem Menschen die Links und den DPMA-Suchstring geben.",
  "Beim Benennen: Kandidaten selbst erzeugen oder markenfrei_suggest_names nutzen, dann alle zusammen mit markenfrei_check_names prüfen (bis 10 Namen).",
].join("\n");

const STATUS_HELP =
  "Status je Quelle: taken = vergeben, not_found = nicht gefunden (das heißt nicht, dass der Name frei oder registrierbar ist), similar = ähnlich, invalid = nicht zulässig, unknown = keine Antwort (nie als frei werten). Ampel: green = keine Treffer in den geprüften Quellen, yellow = Treffer oder Lücken prüfen, red = vergeben. Grün ist keine Markenfreigabe: Markenregister werden nicht abgefragt.";

// --- Eingaben ---------------------------------------------------------------

const SOURCE_IDS = STATIC_SOURCES.map((s) => s.id) as [string, ...string[]];
const DEFAULT_SOURCE_IDS = STATIC_SOURCES.filter((s) => s.defaultEnabled).map((s) => s.id);

/**
 * Im Namensraum social ist keine Quelle standardmäßig aktiv. Wer social wählt, ohne
 * sources anzugeben, bekommt diese Quellen (Hacker News nur über sources, weil die
 * Show-HN-Suche nur ein schwaches Signal ist).
 */
export const SOCIAL_AUTO_SOURCE_IDS: readonly string[] = ["bluesky", "mastodon"].filter((id) =>
  STATIC_SOURCES.some((s) => s.id === id && s.namespace === "social"),
);

/** Quellenauswahl für die Engine: social ohne sources ergänzt die Social-Quellen. */
export function effectiveSources(namespaces: Namespace[] | undefined, sources: string[] | undefined): string[] | undefined {
  if (sources !== undefined || !namespaces?.includes("social")) return sources;
  const ns = new Set(namespaces);
  return STATIC_SOURCES.filter(
    (s) => ns.has(s.namespace) && (s.defaultEnabled || SOCIAL_AUTO_SOURCE_IDS.includes(s.id)),
  ).map((s) => s.id);
}

const nameField = z
  .string()
  .min(2, { error: "Der Name braucht mindestens 2 Zeichen." })
  .max(63, { error: "Der Name darf höchstens 63 Zeichen lang sein." });

/** Form einer Endung ohne Punkt; ob sie wählbar ist, entscheidet `isDomainTld`. */
const TLD_PATTERN = /^[a-z0-9]{2,63}$/;

const checkFields = {
  namespaces: z
    .array(NamespaceSchema)
    .optional()
    .describe(
      `Namensräume (Standard: ${DEFAULT_NAMESPACES.join(", ")}). Erlaubt: ${NAMESPACES.map((n) => `${n} (${NAMESPACE_LABEL[n]})`).join(", ")}. social fragt ${SOCIAL_AUTO_SOURCE_IDS.join(" und ")} ab, solange sources fehlt; mit sources gilt nur diese Liste (Hacker News nur über sources: ["hackernews"]).`,
    ),
  tlds: z
    .array(
      z
        .string()
        .regex(TLD_PATTERN, { error: "Endung ohne Punkt, nur a-z und 0-9." })
        .refine(isDomainTld, { error: "Endung wird nicht unterstützt. Die erlaubten Endungen stehen unter /api/sources." }),
    )
    .max(MAX_TLDS, { error: `Höchstens ${MAX_TLDS} Endungen pro Anfrage.` })
    .optional()
    .describe(
      `Domain-Endungen ohne Punkt, höchstens ${MAX_TLDS} (Standard: ${DEFAULT_DOMAIN_TLDS.join(", ")}). Gültig sind alle Endungen mit RDAP-Server im IANA-Bootstrap sowie at und eu; die Liste steht unter /api/sources.`,
    ),
  sources: z
    .array(z.enum(SOURCE_IDS))
    .optional()
    .describe(
      `Ausdrückliche Quellen statt der Standardauswahl außerhalb von Domains (Standard: ${DEFAULT_SOURCE_IDS.join(", ")}).`,
    ),
};

// --- Ausgaben ---------------------------------------------------------------

export const CheckNamesOutputSchema = z.object({
  ranking: z.array(ShortlistEntrySchema).describe("Frei in allen gewählten Quellen zuerst, dann wenige Treffer, dann wenige Lücken"),
  reports: z.array(ShortlistReportSchema),
});

export type ShortlistReport = z.infer<typeof ShortlistReportSchema>;

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

function statusText(r: SourceResult): string {
  return r.status === "taken" && r.weak ? "schwacher Treffer" : STATUS_LABEL[r.status];
}

/** Treffer, die nachgeprüft werden sollten: vergeben, ähnlich, nicht zulässig. */
function isHit(r: SourceResult): boolean {
  return r.status === "taken" || r.status === "similar" || r.status === "invalid";
}

function linkLines(results: SourceResult[], include: (r: SourceResult) => boolean, indent: string): string[] {
  return results.filter((r) => r.url && include(r)).map((r) => `${indent}${r.label} ${statusText(r)}: ${r.url}`);
}

const NOTHING_CHECKED =
  "Keine Quelle abgefragt, Gelb heißt hier nur: nichts geprüft. Andere namespaces wählen oder sources angeben, z. B. [\"bluesky\",\"mastodon\"].";

/**
 * Kompakter Bericht: eine Zeile je Namensraum, dann Links zu Treffern und Lücken, die
 * Links zur manuellen Social-Prüfung und der Hinweis auf die Marke.
 */
export function formatReport(report: NameReport | ShortlistReport): string {
  const lines = [`${report.name}: ${VERDICT_WORD[report.verdict]} (${report.verdictLabel})`];
  if (report.results.length === 0) lines.push(NOTHING_CHECKED);
  for (const ns of NAMESPACES) {
    const rows = report.results.filter((r) => r.namespace === ns);
    if (rows.length === 0) continue;
    // Hinweise nur bei "ähnlich" und "nicht zulässig"; Lücken stehen gesammelt in einer eigenen Zeile.
    const parts = rows.map(
      (r) => `${r.label} ${statusText(r)}${r.status === "similar" || r.status === "invalid" ? shortNote(r.note) : ""}`,
    );
    lines.push(`${NAMESPACE_LABEL[ns]}: ${parts.join(" | ")}`);
  }
  if (report.incomplete.length > 0) {
    lines.push(`Lücken: ${report.incomplete.join(", ")} (keine verwertbare Antwort, nicht als frei werten)`);
    if (report.results.some((r) => r.retryable)) {
      lines.push(
        "Ein Teil der Lücken ist vorübergehend (Abfragelimit oder Zeitüberschreitung): in etwa 10 Sekunden denselben Aufruf wiederholen, es werden nur die offenen Quellen neu abgefragt.",
      );
    }
  }
  const links = linkLines(report.results, (r) => isHit(r) || r.status === "unknown", "- ");
  if (links.length > 0) lines.push("Nachprüfen:", ...links);
  if (report.manualLinks.length > 0) {
    lines.push(`Manuell prüfen (nicht abgefragt): ${report.manualLinks.map((l) => `${l.label} ${l.url}`).join(" | ")}`);
  }
  lines.push("Marke: nicht geprüft → markenfrei_trademark_prep");
  return lines.join("\n");
}

export type MergedNames = { name: string; inputs: string[] };

/**
 * Rangliste mit Begründung je Name: vergeben, nicht zulässig, ähnlich, schwache Treffer, Lücken. Darunter
 * die Links zu den Treffern (Links zu Lücken liefert markenfrei_check_name).
 */
export function formatRanking(
  ranking: ShortlistEntry[],
  reports: (NameReport | ShortlistReport)[],
  merged: MergedNames[] = [],
): string {
  const byName = new Map(reports.map((r) => [r.name, r]));
  const lines = [`Rangliste (${ranking.length} ${ranking.length === 1 ? "Name" : "Namen"}, ohne Treffer in allen gewählten Quellen zuerst):`];
  ranking.forEach((e, i) => {
    const results = byName.get(e.name)?.results ?? [];
    const labels = (pick: (r: SourceResult) => boolean) => results.filter(pick).map((r) => r.label);
    const similar = labels((r) => r.status === "similar");
    const weak = labels((r) => r.status === "taken" && r.weak === true);
    let line = `${i + 1}. ${e.name}: ${VERDICT_WORD[e.verdict]}`;
    if (results.length === 0) line += " · keine Quelle abgefragt";
    if (e.taken.length > 0) line += ` · vergeben: ${e.taken.join(", ")}`;
    if (e.invalid.length > 0) line += ` · nicht zulässig: ${e.invalid.join(", ")}`;
    if (similar.length > 0) line += ` · ähnlich: ${similar.join(", ")}`;
    if (weak.length > 0) line += ` · schwacher Treffer: ${weak.join(", ")}`;
    if (e.unknown.length > 0) line += ` · Lücken: ${e.unknown.join(", ")}`;
    lines.push(line, ...linkLines(results, isHit, "   "));
  });
  for (const m of merged) {
    lines.push(`Zusammengefasst: ${m.inputs.map((x) => `„${x}“`).join(", ")} → ${m.name}`);
  }
  lines.push(
    "Grün heißt nur: in den geprüften Quellen nichts gefunden. Links zu Lücken und Social: markenfrei_check_name. Marke: nicht geprüft → markenfrei_trademark_prep",
  );
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

/** Bericht ohne Markenvorbereitung für die Shortlist (siehe ShortlistReportSchema). */
function withoutTrademark(report: NameReport): ShortlistReport {
  const copy: Partial<NameReport> = { ...report };
  delete copy.trademark;
  return copy as ShortlistReport;
}

const INPUT_PREVIEW_MAX = 40;

/**
 * Prüft jeden Namen vorab und fasst Namen zusammen, die nach der Normalisierung gleich
 * sind. So scheitert eine Shortlist mit Namen und Position, bevor eine Netzabfrage läuft.
 */
export function prepareShortlist(
  names: string[],
): { ok: true; inputs: string[]; merged: MergedNames[] } | { ok: false; error: string } {
  const groups = new Map<string, string[]>();
  for (const [i, raw] of names.entries()) {
    const n = normalizeName(raw);
    if (!n.ok) {
      const shown = raw.length > INPUT_PREVIEW_MAX ? `${raw.slice(0, INPUT_PREVIEW_MAX - 1)}…` : raw;
      return { ok: false, error: `Name ${i + 1} („${shown}“): ${n.error}` };
    }
    const group = groups.get(n.name);
    if (group) {
      if (!group.includes(raw)) group.push(raw);
    } else groups.set(n.name, [raw]);
  }
  return {
    ok: true,
    // Je normalisiertem Namen die erste Schreibweise; sie bleibt als input im Bericht.
    inputs: [...groups.values()].map((g) => g[0]),
    merged: [...groups.entries()].filter(([, g]) => g.length > 1).map(([name, g]) => ({ name, inputs: g })),
  };
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
      description: `Prüft einen Namen, bevor ein Projekt, Paket, Repo, App-Eintrag oder eine Domain angelegt wird: Domains per RDAP, Paketregister (npm, PyPI, GitHub, crates.io, Homebrew), App Stores und bekannte Namen (Marken-Heuristik, Wikidata, GLEIF). Liefert eine Ampel, je Quelle einen Status und die Vorbereitung der Markenrecherche. Der Text nennt die Links zu Treffern und Lücken sowie Links zur manuellen Social-Prüfung; structuredContent enthält den Link jeder Quelle. ${STATUS_HELP} Für mehrere Kandidaten markenfrei_check_names verwenden.`,
      inputSchema: {
        name: nameField.describe("Der zu prüfende Name, z. B. wachwerk. Umlaute werden ausgeschrieben, eine angehängte Endung entfernt."),
        ...checkFields,
      },
      outputSchema: NameReportSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ name, namespaces, tlds, sources }) => {
      try {
        const report = await checkName(name, { ...opts, namespaces, tlds, sources: effectiveSources(namespaces, sources) });
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
      description: `Prüft bis zu ${MAX_NAMES} Kandidaten in denselben Quellen wie markenfrei_check_name und sortiert sie: ohne Treffer in allen gewählten Quellen zuerst, dann wenige Treffer, dann wenige Lücken. Gedacht für die Namenssuche: Kandidaten erzeugen (selbst oder mit markenfrei_suggest_names) und hier gesammelt prüfen. Gleiche Namen nach der Normalisierung werden einmal geprüft. Der Text begründet jede Ampel und verlinkt die Treffer; die Berichte enthalten keine Markenvorbereitung, dafür markenfrei_trademark_prep. ${STATUS_HELP}`,
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
        const prepared = prepareShortlist(names);
        if (!prepared.ok) return toolError(new CheckInputError(prepared.error));
        const result = await checkNames(prepared.inputs, {
          ...opts,
          namespaces,
          tlds,
          sources: effectiveSources(namespaces, sources),
        });
        const reports = result.reports.map(withoutTrademark);
        return ok(formatRanking(result.ranking, reports, prepared.merged), { ranking: result.ranking, reports });
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
