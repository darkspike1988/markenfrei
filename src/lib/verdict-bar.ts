import type { SourceResult } from "@/lib/engine/types";

/**
 * Aufbau des gegliederten Balkens über der Ergebnisliste, NACH ANZAHL der Quellen (keine Prozent,
 * kein Punktwert). Rein, ohne React. „nicht zulässig“ zählt wie „unbekannt“ (nicht verwertbar,
 * nie als frei). Ein schwacher „vergeben“-Treffer zählt als ähnlich, wie ihn die Zeile zeigt
 * (höchstens Gelb).
 */

export type BarKey = "taken" | "similar" | "not_found" | "unknown";

export type BarSegment = {
  key: BarKey;
  /** Beschriftung in der Zählung, z. B. „vergeben“ */
  label: string;
  count: number;
  /** Schraffur statt Vollfläche (unbekannt darf nicht wie Grün wirken) */
  hatched: boolean;
};

export type VerdictBar = {
  /** Immer vier Segmente in fester Reihenfolge, auch mit Anzahl 0 (für die Zählung) */
  segments: BarSegment[];
  total: number;
  /** „2 vergeben · 0 Treffer prüfen · 20 nicht gefunden · 1 unbekannt“ */
  countText: string;
  /** Satz für Screenreader, nennt jedes Segment mit Wort und Anzahl */
  ariaLabel: string;
  /** Anzahl der Quellen mit „nicht zulässig“ (in „unbekannt“ enthalten) */
  invalid: number;
};

const LABELS: Record<BarKey, string> = {
  taken: "vergeben",
  similar: "Treffer prüfen",
  not_found: "nicht gefunden",
  unknown: "unbekannt",
};

const ORDER: BarKey[] = ["taken", "similar", "not_found", "unknown"];

export function buildVerdictBar(results: readonly Pick<SourceResult, "status" | "weak">[]): VerdictBar {
  const n: Record<BarKey, number> = { taken: 0, similar: 0, not_found: 0, unknown: 0 };
  let invalid = 0;
  for (const r of results) {
    if (r.status === "taken") n[r.weak ? "similar" : "taken"]++;
    else if (r.status === "similar") n.similar++;
    else if (r.status === "not_found") n.not_found++;
    else {
      n.unknown++;
      if (r.status === "invalid") invalid++;
    }
  }
  const segments = ORDER.map((key): BarSegment => ({ key, label: LABELS[key], count: n[key], hatched: key === "unknown" }));
  const countText = segments.map((s) => `${s.count} ${s.label}`).join(" · ");
  const invalidNote = invalid > 0 ? ` (davon ${invalid} nicht zulässig)` : "";
  return {
    segments,
    total: results.length,
    countText: countText + invalidNote,
    ariaLabel: `Quellen: ${segments.map((s) => `${s.count} ${s.label}`).join(", ")}${invalidNote}`,
    invalid,
  };
}
