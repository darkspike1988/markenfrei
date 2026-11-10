import type { NameReport } from "@/lib/engine/check";
import type { SourceResult } from "@/lib/engine/types";
import {
  computeVerdict,
  countStatuses,
  rankReports,
  STATUS_LABEL,
  VERDICT_LABEL,
  type ShortlistEntry,
  type Verdict,
} from "@/lib/engine/verdict";
import type { SnapshotChange, SourceState } from "@/lib/history";
import type { Selection } from "@/components/checker-config";

/** Reine Typen und Funktionen des Prüflaufs (ohne React), damit sie sich mit node:test prüfen lassen. */

export type Waiting = { attempt: number; max: number };

/** Fortschritt von „Übrige geprüfte Endungen ansehen“: so viele Endungen von `total` sind abgefragt. */
export type Extending = { checked: number; total: number };

export type Item =
  | { state: "loading" }
  | {
      state: "done";
      report: NameReport;
      waiting?: Waiting;
      rechecking?: boolean;
      retryError?: string;
      /** Gesetzt, solange weitere Endungen nachgeprüft werden */
      extending?: Extending;
      /** Das Nachprüfen weiterer Endungen ist gescheitert; der Bericht blieb unverändert */
      extendError?: string;
    }
  | { state: "error"; message: string };

/** Ergebnis einer Anfrage an /api/check für einen Namen. */
export type Outcome = { ok: true; report: NameReport } | { ok: false; message: string };

/**
 * Fügt einem Bericht Ergebniszeilen hinzu (z. B. nachgeprüfte Endungen): Zeilen mit einer Quelle, die der
 * Bericht schon hat, fallen weg. Ampel, Ampeltext, Zählung und Quellen ohne Antwort werden mit denselben
 * Funktionen wie auf dem Server neu berechnet. Ohne neue Zeile kommt derselbe Bericht zurück.
 */
export function mergeResults(report: NameReport, rows: readonly SourceResult[]): NameReport {
  const seen = new Set(report.results.map((r) => r.sourceId));
  const added: SourceResult[] = [];
  for (const r of rows) {
    if (seen.has(r.sourceId)) continue;
    seen.add(r.sourceId);
    added.push(r);
  }
  if (added.length === 0) return report;
  const results = [...report.results, ...added];
  const verdict = computeVerdict(results);
  return {
    ...report,
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    counts: countStatuses(results),
    incomplete: results.filter((r) => r.status === "unknown").map((r) => r.label),
    results,
  };
}

/** Kuratierte Endungen, die der Bericht noch nicht enthält, in der Reihenfolge von `featured`. */
export function remainingFeaturedTlds(report: NameReport, featured: readonly string[]): string[] {
  const have = new Set(report.results.filter((r) => r.namespace === "domains").map((r) => r.sourceId.replace(/^rdap:/, "")));
  return featured.filter((t) => !have.has(t));
}

/** Teilt Endungen in Gruppen von höchstens `max` (eine Anfrage je Gruppe). */
export function tldBatches(tlds: readonly string[], max: number): string[][] {
  const size = Math.max(1, Math.floor(max));
  const out: string[][] = [];
  for (let i = 0; i < tlds.length; i += size) out.push(tlds.slice(i, i + size));
  return out;
}

/**
 * Was aus dem Eintrag eines Namens nach einer Antwort oder einem Fehler wird. Scheitert eine Wiederholung,
 * bleibt der letzte fertige Bericht stehen (mit `retryError`), statt durch eine Fehlermeldung ersetzt zu werden.
 * Ohne vorhandenen Bericht wird ein Fehler zum Zustand "error". Ein Erfolg ersetzt den Bericht und löscht `retryError`;
 * nachgeprüfte Endungen des alten Berichts, die die neue Antwort nicht enthält, bleiben dabei erhalten.
 */
export function nextItem(previous: Item | undefined, outcome: Outcome): Item {
  if (outcome.ok) {
    const carried = previous?.state === "done" ? previous.report.results.filter((r) => r.namespace === "domains") : [];
    return { state: "done", report: mergeResults(outcome.report, carried) };
  }
  if (previous?.state === "done") return { state: "done", report: previous.report, retryError: outcome.message };
  return { state: "error", message: outcome.message };
}

export type Run = { id: number; sel: Selection; items: Record<string, Item> };

export const CANCELLED_MESSAGE = "Prüfung abgebrochen.";

/**
 * Lauf nach „Abbrechen“: offene Namen werden zu Fehlerzeilen (mit „Erneut prüfen“), fertige
 * Berichte bleiben stehen, automatisches und händisches Nachprüfen endet.
 */
export function cancelRun(run: Run): Run {
  const items: Record<string, Item> = {};
  for (const [name, item] of Object.entries(run.items)) {
    if (item.state === "loading") items[name] = { state: "error", message: CANCELLED_MESSAGE };
    else if (item.state === "done") {
      items[name] = item.retryError
        ? { state: "done", report: item.report, retryError: item.retryError }
        : { state: "done", report: item.report };
    } else items[name] = item;
  }
  return { ...run, items };
}

/** Stand für den Signalgeber im Seitenkopf: läuft noch, sonst die schlechteste Ampel der fertigen Berichte. */
export type RunSignal = "checking" | Verdict | null;

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
  /** Offene Quellen werden gerade automatisch oder von Hand erneut geprüft */
  rechecking: boolean;
  /** Für mindestens einen Namen werden gerade weitere Endungen nachgeprüft */
  extending: boolean;
  /** Anzahl der fertigen Berichte je Ampel */
  tally: Record<Verdict, number>;
  signal: RunSignal;
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
  const rechecking = names.some((n) => {
    const it = run?.items[n];
    return it?.state === "done" && (it.waiting !== undefined || it.rechecking === true);
  });
  const extending = names.some((n) => {
    const it = run?.items[n];
    return it?.state === "done" && it.extending !== undefined;
  });
  const tally: Record<Verdict, number> = { green: 0, yellow: 0, red: 0 };
  for (const r of done) tally[r.verdict]++;
  const worst: Verdict | null = tally.red > 0 ? "red" : tally.yellow > 0 ? "yellow" : tally.green > 0 ? "green" : null;
  return {
    names,
    done,
    pending,
    failed,
    ranking,
    ranked,
    latestCheck,
    finished: run !== null && pending.length === 0,
    rechecking,
    extending,
    tally,
    signal: pending.length > 0 || rechecking || extending ? "checking" : worst,
    firstOpen: ranking.find((e) => e.verdict !== "green")?.name,
  };
}

/**
 * Der Lauf ist zur Ruhe gekommen: alle Namen fertig, kein automatisches oder händisches Nachprüfen offen,
 * keine Endungen in Arbeit, mindestens ein Bericht. Erst dann gilt das Ergebnis als Stand für Verlauf und Link.
 */
export function isSettled(view: RunView): boolean {
  return view.finished && !view.rechecking && !view.extending && view.done.length > 0;
}

function stateText(state: SourceState): string {
  return state.weak && state.status === "taken" ? `${STATUS_LABEL.taken} (schwaches Signal)` : STATUS_LABEL[state.status];
}

/**
 * Eine Zeile je Änderung für den Hinweis über den Berichten, z. B. „wachwerk · .com: nicht gefunden → vergeben“.
 * Die Beschriftung der Quelle kommt aus dem aktuellen Bericht, sonst steht die Quellen-ID da.
 */
export function changeLines(changes: readonly SnapshotChange[], reports: readonly NameReport[]): string[] {
  return changes.map((c) => {
    const label = reports.find((r) => r.name === c.name)?.results.find((r) => r.sourceId === c.sourceId)?.label;
    return `${c.name} · ${label ?? c.sourceId}: ${stateText(c.from)} → ${stateText(c.to)}`;
  });
}

/**
 * Inhalt des JSON-Exports eines Laufs (nur fertige Berichte, in Eingabereihenfolge). `excludedSources`
 * nennt abgewählte Standardquellen und fehlt, wenn keine abgewählt sind.
 */
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
      query: {
        names: run.sel.names,
        namespaces: run.sel.namespaces,
        tlds: run.sel.tlds,
        sources: run.sel.extra,
        ...(run.sel.excluded.length ? { excludedSources: run.sel.excluded } : {}),
      },
      ranking: rankReports(reports),
      reports,
    },
  };
}
