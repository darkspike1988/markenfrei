/**
 * Textausgabe und Shortlist-Vorbereitung, gemeinsam für MCP und Kommandozeile.
 * Bewusst ohne Import des MCP-SDK, damit die CLI es nicht mitlädt.
 */
import { z } from "zod";
import { STATIC_SOURCES, type NameReport } from "@/lib/engine/check";
import { ShortlistEntrySchema, ShortlistReportSchema } from "@/lib/engine/report-schema";
import { NAMESPACE_LABEL, NAMESPACES, type Namespace, type SourceResult } from "@/lib/engine/types";
import { STATUS_LABEL, type ShortlistEntry, type Verdict } from "@/lib/engine/verdict";
import { normalizeName } from "@/lib/name";

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

export const CheckNamesOutputSchema = z.object({
  ranking: z.array(ShortlistEntrySchema).describe("Frei in allen gewählten Quellen zuerst, dann wenige Treffer, dann wenige Lücken"),
  reports: z.array(ShortlistReportSchema),
});

export type ShortlistReport = z.infer<typeof ShortlistReportSchema>;

// --- Texte ------------------------------------------------------------------

/** Hinweis am Ende der Berichte; die MCP-Fassung verweist auf das MCP-Werkzeug. */
export const MCP_TRADEMARK_HINT = "Marke: nicht geprüft → markenfrei_trademark_prep";
export const MCP_RANKING_HINT =
  "Grün heißt nur: in den geprüften Quellen nichts gefunden. Links zu Lücken und Social: markenfrei_check_name. Marke: nicht geprüft → markenfrei_trademark_prep";

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
 * Links zur manuellen Social-Prüfung und der Hinweis auf die Marke (`trademarkHint`).
 */
export function formatReport(report: NameReport | ShortlistReport, trademarkHint: string = MCP_TRADEMARK_HINT): string {
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
  lines.push(trademarkHint);
  return lines.join("\n");
}

export type MergedNames = { name: string; inputs: string[] };

/**
 * Rangliste mit Begründung je Name: vergeben, nicht zulässig, ähnlich, schwache Treffer, Lücken. Darunter
 * die Links zu den Treffern (Links zu Lücken liefert markenfrei_check_name). `closingHint` ersetzt
 * den MCP-Schlusssatz.
 */
export function formatRanking(
  ranking: ShortlistEntry[],
  reports: (NameReport | ShortlistReport)[],
  merged: MergedNames[] = [],
  closingHint: string = MCP_RANKING_HINT,
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
  lines.push(closingHint);
  return lines.join("\n");
}

/** Bericht ohne Markenvorbereitung für die Shortlist (siehe ShortlistReportSchema). */
export function withoutTrademark(report: NameReport): ShortlistReport {
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
