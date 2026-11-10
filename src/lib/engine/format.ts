/**
 * Textausgabe, Shortlist-Vorbereitung und Quellenauswahl (Profile), gemeinsam für MCP, HTTP und
 * Kommandozeile. Bewusst ohne Import des MCP-SDK, damit die CLI es nicht mitlädt.
 */
import { z } from "zod";
import { CheckInputError, STATIC_SOURCES, type CheckOptions, type NameReport } from "@/lib/engine/check";
import { ShortlistEntrySchema, ShortlistReportSchema } from "@/lib/engine/report-schema";
import { DEFAULT_DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { NAMESPACE_LABEL, NAMESPACES, type Namespace, type SourceResult } from "@/lib/engine/types";
import { STATUS_LABEL, type ShortlistEntry, type Verdict } from "@/lib/engine/verdict";
import { normalizeName } from "@/lib/name";
import { buildProfiles, type CheckProfile } from "@/lib/profiles";

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

// --- Profile ----------------------------------------------------------------

/** Profile (src/lib/profiles.ts) aus den eingebauten Quellen und den Standard-Endungen. */
export const CHECK_PROFILES: readonly CheckProfile[] = buildProfiles(STATIC_SOURCES, DEFAULT_DOMAIN_TLDS);
export const PROFILE_IDS = CHECK_PROFILES.map((p) => p.id) as [string, ...string[]];

export function unknownProfileMessage(id?: unknown): string {
  const shown = typeof id === "string" ? ` „${id.slice(0, 30)}“` : "";
  return `Unbekanntes Profil${shown}. Erlaubt: ${PROFILE_IDS.join(", ")}.`;
}

/** Quellen, die jedes Profil außer „allgemein“ zusätzlich prüft (Standardquellen der bekannten Namen). */
export const PROFILE_SHARED_IDS: readonly string[] = STATIC_SOURCES.filter(
  (s) => s.namespace === "known_names" && s.defaultEnabled,
).map((s) => s.id);

/** Was ein Profil prüft, kurz: „Domains .com .de, npm, github“ (ohne PROFILE_SHARED_IDS). */
export function profileSummary(p: CheckProfile): string {
  if (p.id === "allgemein") return "Standardauswahl";
  const domains = p.tlds ? [`Domains ${p.tlds.map((t) => `.${t}`).join(" ")}`] : [];
  return [...domains, ...p.sources.filter((id) => !PROFILE_SHARED_IDS.includes(id))].join(", ");
}

/** Kurzliste der Profile für Werkzeugbeschreibungen: „npm = npm, jsr, github“ usw. */
export function describeProfiles(): string {
  const parts = CHECK_PROFILES.map((p) => `${p.id} = ${profileSummary(p)}`);
  return `${parts.join("; ")}. Jedes Profil außer allgemein prüft dazu ${PROFILE_SHARED_IDS.join(", ")}.`;
}

export type CheckSelection = Pick<CheckOptions, "namespaces" | "tlds" | "sources">;

/**
 * Quellenauswahl aus Profil und ausdrücklichen Angaben, für die Prüfung und die Kosten fürs
 * Rate-Limit gleich. Ohne Profil gilt die bisherige Auswahl. Ein Profil setzt Namensräume, Quellen
 * und Endungen; ausdrückliche `sources` und `tlds` ersetzen den jeweiligen Teil. Ausdrückliche
 * `namespaces` ersetzen die Namensräume: Quellen und Endungen des Profils bleiben nur in den
 * gewählten Namensräumen, Namensräume ohne Quelle im Profil bekommen ihre Standardquellen.
 * `socialAuto` ergänzt bei social die Social-Quellen (MCP und CLI, siehe effectiveSources).
 * Wirft CheckInputError bei unbekanntem Profil; übrige Werte prüft resolveSources.
 */
export function selectSources(
  input: { profile?: unknown; namespaces?: unknown; tlds?: unknown; sources?: unknown },
  socialAuto: boolean,
): CheckSelection {
  const namespaces = input.namespaces as Namespace[] | undefined;
  const tlds = input.tlds as string[] | undefined;
  const sources = input.sources as string[] | undefined;
  if (input.profile === undefined || input.profile === null) {
    return { namespaces, tlds, sources: socialAuto && Array.isArray(namespaces) ? effectiveSources(namespaces, sources) : sources };
  }
  const profile = CHECK_PROFILES.find((p) => p.id === input.profile);
  if (!profile) throw new CheckInputError(unknownProfileMessage(input.profile));
  if (namespaces === undefined) {
    return { namespaces: [...profile.namespaces], tlds: tlds ?? profile.tlds?.slice(), sources: sources ?? [...profile.sources] };
  }
  if (!Array.isArray(namespaces)) throw new CheckInputError("namespaces muss eine Liste sein.");
  const chosen = new Set<string>(namespaces);
  const namespaceOf = new Map(STATIC_SOURCES.map((s) => [s.id, s.namespace]));
  const covered = new Set(profile.sources.map((id) => namespaceOf.get(id)));
  const picked = sources ?? [
    ...profile.sources.filter((id) => chosen.has(namespaceOf.get(id) ?? "")),
    ...STATIC_SOURCES.filter(
      (s) =>
        chosen.has(s.namespace) &&
        !covered.has(s.namespace) &&
        (s.defaultEnabled || (socialAuto && SOCIAL_AUTO_SOURCE_IDS.includes(s.id))),
    ).map((s) => s.id),
  ];
  return { namespaces, tlds: tlds ?? (chosen.has("domains") ? profile.tlds?.slice() : undefined), sources: picked };
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

/** Beginn jeder Zeile mit Registrierungs-Link (siehe SourceResult.register). */
export const REGISTER_LINE_PREFIX = "Domain registrieren (Angebot des Betreibers, vergütet)";
/** Anweisung unter den Registrierungs-Links; die CLI hat eine eigene Fassung. */
export const MCP_REGISTER_HINT =
  "Diese Links dem Nutzer zeigen, nichts selbst bestellen. „Nicht gefunden“ ist keine Zusage, dass die Domain bestellbar ist.";

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

function registerLines(results: SourceResult[], indent: string): string[] {
  return results.filter((r) => r.register).map((r) => `${indent}${REGISTER_LINE_PREFIX}: ${r.target} → ${r.register?.url}`);
}

const NOTHING_CHECKED =
  "Keine Quelle abgefragt, Gelb heißt hier nur: nichts geprüft. Andere namespaces wählen oder sources angeben, z. B. [\"bluesky\",\"mastodon\"].";

/**
 * Kompakter Bericht: eine Zeile je Namensraum, darunter die Registrierungs-Links des Betreibers
 * mit `registerHint`, dann Links zu Treffern und Lücken, die Links zur manuellen Social-Prüfung
 * und der Hinweis auf die Marke (`trademarkHint`).
 */
export function formatReport(
  report: NameReport | ShortlistReport,
  trademarkHint: string = MCP_TRADEMARK_HINT,
  registerHint: string = MCP_REGISTER_HINT,
): string {
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
  const register = registerLines(report.results, "");
  if (register.length > 0) lines.push(...register, registerHint);
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
 * die Links zu den Treffern (Links zu Lücken liefert markenfrei_check_name) und die Registrierungs-Links
 * des Betreibers, am Ende einmal `registerHint`. `closingHint` ersetzt den MCP-Schlusssatz.
 */
export function formatRanking(
  ranking: ShortlistEntry[],
  reports: (NameReport | ShortlistReport)[],
  merged: MergedNames[] = [],
  closingHint: string = MCP_RANKING_HINT,
  registerHint: string = MCP_REGISTER_HINT,
): string {
  const byName = new Map(reports.map((r) => [r.name, r]));
  const lines = [`Rangliste (${ranking.length} ${ranking.length === 1 ? "Name" : "Namen"}, ohne Treffer in allen gewählten Quellen zuerst):`];
  let anyRegister = false;
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
    const register = registerLines(results, "   ");
    if (register.length > 0) anyRegister = true;
    lines.push(line, ...linkLines(results, isHit, "   "), ...register);
  });
  for (const m of merged) {
    lines.push(`Zusammengefasst: ${m.inputs.map((x) => `„${x}“`).join(", ")} → ${m.name}`);
  }
  if (anyRegister) lines.push(registerHint);
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
