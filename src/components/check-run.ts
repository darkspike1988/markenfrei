import type { NameReport } from "@/lib/engine/check";
import { rankReports, type ShortlistEntry } from "@/lib/engine/verdict";
import type { Selection } from "@/components/checker-config";

/** Reine Typen und Funktionen des Prüflaufs (ohne React), damit sie sich mit node:test prüfen lassen. */

export type Waiting = { attempt: number; max: number };

export type Item =
  | { state: "loading" }
  | { state: "done"; report: NameReport; waiting?: Waiting; rechecking?: boolean }
  | { state: "error"; message: string };

export type Run = { id: number; sel: Selection; items: Record<string, Item> };

/** Aus einem Lauf abgeleitete Ergebnisdaten für die Anzeige. */
export type RunView = {
  names: string[];
  /** Fertige Berichte, je normalisiertem Namen einer */
  done: NameReport[];
  pending: string[];
  failed: string[];
  ranking: ShortlistEntry[];
  /** Fertige Berichte in Rangfolge, für Vergleich und Export */
  ranked: NameReport[];
  /** Zeitpunkt der jüngsten Prüfung (ISO), leer ohne Ergebnis */
  latestCheck: string;
  finished: boolean;
  /** Beim Einhängen offen: bei mehreren Namen der erste mit Treffer oder Lücke (Rangfolge), sonst nichts */
  firstOpen: string | undefined;
};

export function deriveRun(run: Run | null): RunView {
  const names = run?.sel.names ?? [];
  const done: NameReport[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const it = run?.items[n];
    if (it?.state === "done" && !seen.has(it.report.name)) {
      seen.add(it.report.name);
      done.push(it.report);
    }
  }
  const pending = names.filter((n) => run?.items[n]?.state === "loading");
  const failed = names.filter((n) => run?.items[n]?.state === "error");
  const ranking = rankReports(done);
  const byName = new Map(done.map((r) => [r.name, r]));
  const ranked = ranking.flatMap((e) => {
    const r = byName.get(e.name);
    return r ? [r] : [];
  });
  const latestCheck = done.reduce((latest, r) => (r.checkedAt > latest ? r.checkedAt : latest), "");
  return {
    names,
    done,
    pending,
    failed,
    ranking,
    ranked,
    latestCheck,
    finished: run !== null && pending.length === 0,
    firstOpen: ranking.find((e) => e.verdict !== "green")?.name,
  };
}

/** Inhalt des JSON-Exports eines Laufs (nur fertige Berichte, in Eingabereihenfolge). */
export function buildJsonExport(run: Run, exportedAt: string) {
  const reports = run.sel.names
    .map((n) => run.items[n])
    .filter((i): i is Extract<Item, { state: "done" }> => i?.state === "done")
    .map((i) => i.report);
  return {
    reports,
    data: {
      tool: "Markenfrei",
      note: "Vorprüfung, keine Rechtsberatung. Marke nicht geprüft.",
      exportedAt,
      query: { names: run.sel.names, namespaces: run.sel.namespaces, tlds: run.sel.tlds, sources: run.sel.extra },
      ranking: rankReports(reports),
      reports,
    },
  };
}
