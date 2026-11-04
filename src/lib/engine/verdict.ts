import type { SourceResult, Status } from "@/lib/engine/types";

export type Verdict = "green" | "yellow" | "red";

export const VERDICT_LABEL: Record<Verdict, string> = {
  green: "Keine Treffer",
  yellow: "Treffer oder Lücken prüfen",
  red: "Vergeben",
};

export const STATUS_LABEL: Record<Status, string> = {
  taken: "vergeben",
  not_found: "nicht gefunden",
  similar: "ähnlich",
  invalid: "nicht zulässig",
  unknown: "unbekannt",
};

/**
 * Eine Quelle der Wahrheit für die Ampel (docs/v2-spec.md, "Ergebnismodell"):
 * - rot: eine Quelle meldet "taken" (nicht schwach) oder "invalid"
 * - grün: alle Quellen melden "not_found"
 * - gelb: alles andere (ähnlich, unbekannt, schwache Treffer)
 */
export function computeVerdict(results: SourceResult[]): Verdict {
  if (results.length === 0) return "yellow";
  if (results.some((r) => (r.status === "taken" && !r.weak) || r.status === "invalid")) return "red";
  if (results.every((r) => r.status === "not_found")) return "green";
  return "yellow";
}

export function countStatuses(results: SourceResult[]): Record<Status, number> {
  const out: Record<Status, number> = { taken: 0, not_found: 0, similar: 0, invalid: 0, unknown: 0 };
  for (const r of results) out[r.status]++;
  return out;
}

export type ShortlistEntry = {
  name: string;
  verdict: Verdict;
  freeInAll: boolean;
  /** Labels der Quellen mit "vergeben" oder "nicht zulässig" */
  taken: string[];
  /** Labels der Quellen ohne verwertbare Antwort */
  unknown: string[];
};

const RANK: Record<Verdict, number> = { green: 0, yellow: 1, red: 2 };

/**
 * Rangliste einer Shortlist: frei zuerst, dann wenige Treffer, dann wenige Lücken.
 * Rein (ohne Netz), damit Server und Oberfläche dieselbe Reihenfolge nutzen.
 */
export function rankReports(
  reports: { name: string; verdict: Verdict; results: SourceResult[] }[],
): ShortlistEntry[] {
  return reports
    .map((r) => ({
      name: r.name,
      verdict: r.verdict,
      freeInAll: r.verdict === "green",
      taken: r.results.filter((x) => (x.status === "taken" && !x.weak) || x.status === "invalid").map((x) => x.label),
      unknown: r.results.filter((x) => x.status === "unknown").map((x) => x.label),
    }))
    .sort(
      (a, b) =>
        RANK[a.verdict] - RANK[b.verdict] ||
        a.taken.length - b.taken.length ||
        a.unknown.length - b.unknown.length ||
        a.name.localeCompare(b.name),
    );
}
