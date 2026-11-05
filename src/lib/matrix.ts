import type { NameReport } from "@/lib/engine/check";
import type { Namespace, SourceResult } from "@/lib/engine/types";
import { NAMESPACES } from "@/lib/engine/types";

/**
 * Daten für die Vergleichsmatrix (rein, ohne React): je Name und Namensraum ein kurzer Text und
 * eine Schwere für das Zeichen davor. „Frei“ wird nie behauptet, grün heißt „nichts gefunden“.
 */

/** Höchstens so viele Quellen werden in einer Zelle genannt, der Rest als „+N“. */
const MAX_LISTED = 3;

export type MatrixTone = "ok" | "warn" | "bad" | "unknown";

export type MatrixCell = { text: string; tone: MatrixTone };

function listed(items: string[]): string {
  if (items.length <= MAX_LISTED) return items.join(", ");
  return `${items.slice(0, MAX_LISTED).join(", ")} +${items.length - MAX_LISTED}`;
}

/** Namensräume, die in mindestens einem Bericht abgefragt wurden, in fester Reihenfolge. */
export function matrixColumns(reports: readonly NameReport[]): Namespace[] {
  const used = new Set<Namespace>();
  for (const report of reports) for (const r of report.results) used.add(r.namespace);
  return NAMESPACES.filter((ns) => used.has(ns));
}

/**
 * Zelle für die Quellen eines Namensraums eines Berichts. `null`, wenn dort nichts abgefragt wurde.
 * Reihenfolge der Teile: vergeben, nicht zulässig, schwacher Treffer oder ähnlich, ohne Antwort.
 */
export function matrixCell(results: readonly SourceResult[], ns: Namespace): MatrixCell | null {
  const rows = results.filter((r) => r.namespace === ns);
  if (rows.length === 0) return null;

  const taken = rows.filter((r) => r.status === "taken" && !r.weak).map((r) => r.label);
  const invalid = rows.filter((r) => r.status === "invalid").map((r) => r.label);
  const soft = rows.filter((r) => r.status === "similar" || (r.status === "taken" && r.weak)).map((r) => r.label);
  const unknown = rows.filter((r) => r.status === "unknown").length;

  const parts: string[] = [];
  if (taken.length) parts.push(`vergeben: ${listed(taken)}`);
  if (invalid.length) parts.push(`nicht zulässig: ${listed(invalid)}`);
  if (soft.length) parts.push(`ähnlich: ${listed(soft)}`);
  if (unknown) parts.push(unknown === rows.length ? "ohne Antwort" : `${unknown} ohne Antwort`);
  if (parts.length === 0) return { text: "nichts gefunden", tone: "ok" };

  const tone: MatrixTone = taken.length || invalid.length ? "bad" : soft.length ? "warn" : "unknown";
  return { text: parts.join(" · "), tone };
}
