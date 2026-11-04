/**
 * zod-Schemas der Engine-Ergebnisse (MCP-outputSchema, Validierung in Tests).
 *
 * Die Typen selbst stehen in types.ts, check.ts, verdict.ts und trademark-prep.ts. Die
 * Prüfungen am Dateiende brechen `tsc` ab, sobald Schema und Typ auseinanderlaufen.
 */

import { z } from "zod";
import type { NameReport } from "@/lib/engine/check";
import type { TrademarkPrep } from "@/lib/engine/trademark-prep";
import type { Namespace, SourceResult, Status } from "@/lib/engine/types";
import { NAMESPACES } from "@/lib/engine/types";
import type { ShortlistEntry, Verdict } from "@/lib/engine/verdict";

const STATUSES = ["taken", "not_found", "similar", "invalid", "unknown"] as const satisfies readonly Status[];
const VERDICTS = ["green", "yellow", "red"] as const satisfies readonly Verdict[];

export const StatusSchema = z
  .enum(STATUSES)
  .describe(
    "taken = vergeben; not_found = die Quelle kennt den Namen nicht (heißt nicht registrierbar); similar = ähnlicher oder nicht eindeutiger Treffer; invalid = in diesem Namensraum nicht zulässig; unknown = keine verwertbare Antwort, nie als frei werten",
  );

export const NamespaceSchema = z.enum(NAMESPACES as unknown as [Namespace, ...Namespace[]]);

export const VerdictSchema = z
  .enum(VERDICTS)
  .describe("green = keine Treffer in den geprüften Quellen (keine Markenfreigabe); yellow = Treffer oder Lücken prüfen; red = vergeben");

export const SourceResultSchema = z.object({
  sourceId: z.string().describe("Stabile ID der Quelle, z. B. npm oder rdap:de"),
  namespace: NamespaceSchema,
  label: z.string().describe("Anzeigename, z. B. npm oder .de"),
  target: z.string().describe("Was geprüft wurde, z. B. wachwerk.de"),
  status: StatusSchema,
  url: z.string().optional().describe("Link zum manuellen Nachprüfen"),
  note: z.string().optional().describe("Kurzer Hinweis"),
  evidence: z.string().optional().describe("Technischer Beleg, z. B. HTTP 404"),
  weak: z.boolean().optional().describe("Schwaches Signal: ein Treffer ergibt höchstens Gelb"),
});

export const TrademarkLinkSchema = z.object({
  office: z.string(),
  label: z.string(),
  url: z.string(),
  what: z.string(),
});

export const TrademarkClassSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  reason: z.string(),
});

export const TrademarkPrepSchema = z.object({
  status: z.literal("not_checked").describe("Markenregister werden nie abgefragt"),
  note: z.string(),
  links: z.array(TrademarkLinkSchema),
  dpmaExpertQuery: z.string().describe("Suchstring für die DPMAregister-Expertenrecherche"),
  variants: z.array(z.string()).describe("Schreibvarianten, die mitgesucht werden sollten"),
  classes: z.array(TrademarkClassSchema).describe("Vorgeschlagene oder vorgegebene Nizza-Klassen"),
  checklist: z.array(z.string()),
});

export const StatusCountsSchema = z.object({
  taken: z.number().int(),
  not_found: z.number().int(),
  similar: z.number().int(),
  invalid: z.number().int(),
  unknown: z.number().int(),
});

export const NameReportSchema = z.object({
  schemaVersion: z.literal(2),
  input: z.string(),
  name: z.string().describe("Normalisierter Name"),
  checkedAt: z.string().describe("Zeitpunkt der Prüfung (ISO 8601)"),
  verdict: VerdictSchema,
  verdictLabel: z.string(),
  counts: StatusCountsSchema,
  incomplete: z.array(z.string()).describe("Quellen ohne verwertbare Antwort; dort heißt nichts gefunden nicht frei"),
  results: z.array(SourceResultSchema),
  trademark: TrademarkPrepSchema,
  manualLinks: z
    .array(z.object({ label: z.string(), url: z.string() }))
    .describe("Nur Links zur manuellen Prüfung (Instagram, TikTok, X, YouTube, Chrome Web Store)"),
});

export const ShortlistEntrySchema = z.object({
  name: z.string(),
  verdict: VerdictSchema,
  freeInAll: z.boolean().describe("In allen gewählten Quellen nicht gefunden"),
  taken: z.array(z.string()).describe("Quellen mit vergeben oder nicht zulässig"),
  unknown: z.array(z.string()).describe("Quellen ohne verwertbare Antwort"),
});

// --- Abgleich Schema ↔ Typ (nur zur Übersetzungszeit) ----------------------

/** Strenge Gleichheit: erkennt auch fehlende oder zusätzliche optionale Felder. */
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assertSame<T extends true>(): T | undefined {
  return undefined;
}
assertSame<Same<z.infer<typeof SourceResultSchema>, SourceResult>>();
assertSame<Same<z.infer<typeof TrademarkPrepSchema>, TrademarkPrep>>();
assertSame<Same<z.infer<typeof NameReportSchema>, NameReport>>();
assertSame<Same<z.infer<typeof ShortlistEntrySchema>, ShortlistEntry>>();
