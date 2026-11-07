"use client";

import type { RefObject } from "react";
import Link from "next/link";
import { EXPORT_DISCLAIMER } from "@/lib/export";
import type { Run, RunView } from "@/components/check-run";
import { Chip } from "@/components/chip";
import { CopyButton } from "@/components/copy-button";
import { MatrixView } from "@/components/matrix-view";
import { QUIET_BUTTON, ReportEntry, ReportError, ReportSkeleton } from "@/components/report-card";
import { VerdictBadge } from "@/components/status-badge";
import { shortlistCount } from "@/components/verdict-text";

const PRINT_DATE = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" });

/**
 * Ergebnisbereich: Überschrift, Exporte, Umschalter Liste/Vergleich, Berichtszeilen, Legende und
 * Druckfußzeile. Reine Darstellung; Zustand und Aktionen kommen vom Aufrufer.
 */
export function CheckResults({
  run,
  view,
  mode,
  onViewChange,
  resultsRef,
  headingRef,
  exportJson,
  exportCsv,
  exportMarkdown,
  openFromMatrix,
  recheck,
  retry,
  checkTypoVariants,
}: {
  run: Run | null;
  view: RunView;
  mode: "list" | "matrix";
  onViewChange: (mode: "list" | "matrix") => void;
  resultsRef: RefObject<HTMLDivElement | null>;
  headingRef: RefObject<HTMLHeadingElement | null>;
  exportJson: () => void;
  exportCsv: () => void;
  exportMarkdown: () => void;
  openFromMatrix: (name: string) => void;
  recheck: (name: string) => void;
  retry: (name: string) => void;
  checkTypoVariants: (original: string, variants: string[]) => void;
}) {
  const { names, done, pending, failed, ranking, ranked, latestCheck, finished, firstOpen } = view;
  const showMatrix = mode === "matrix" && ranked.length > 1;

  return (
    <div ref={resultsRef} className="scroll-mt-6 space-y-3">
      <p className="sr-only" aria-live="polite">
        {run
          ? finished
            ? `${done.length} von ${names.length} Namen geprüft.`
            : `Prüfe ${names.length === 1 ? "einen Namen" : `${names.length} Namen`} …`
          : ""}
      </p>

      {run && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 ref={headingRef} tabIndex={-1} className="font-serif text-2xl tracking-tight text-ink outline-none">
                {names.length === 1 ? "Ergebnis" : "Ergebnisse"}
              </h2>
              {names.length > 1 && <p className="text-sm text-muted">{shortlistCount(ranking, pending.length)}</p>}
            </div>
            {done.length > 0 && (
              <div className="flex flex-wrap gap-x-4 print:hidden">
                <CopyButton text={() => window.location.href} label="Link kopieren" />
                <button type="button" onClick={exportJson} className={QUIET_BUTTON}>
                  JSON exportieren
                </button>
                <button type="button" onClick={exportCsv} className={QUIET_BUTTON}>
                  Als CSV
                </button>
                <button type="button" onClick={exportMarkdown} className={QUIET_BUTTON}>
                  Als Markdown
                </button>
                <button type="button" onClick={() => window.print()} className={QUIET_BUTTON}>
                  Drucken
                </button>
              </div>
            )}
          </div>

          {ranked.length > 1 && (
            <div role="group" aria-label="Ansicht" className="flex gap-1.5 print:hidden">
              <Chip pressed={!showMatrix} onClick={() => onViewChange("list")}>
                Liste
              </Chip>
              <Chip pressed={showMatrix} onClick={() => onViewChange("matrix")}>
                Vergleich
              </Chip>
            </div>
          )}

          {showMatrix && (
            <div className="print:hidden">
              <MatrixView reports={ranked} pending={pending.length + failed.length} onOpen={openFromMatrix} />
            </div>
          )}

          <div className={`divide-y divide-line border-y border-line ${showMatrix ? "hidden print:block" : ""}`}>
            {ranking.map((e) => {
              const key = names.find((n) => {
                const it = run.items[n];
                return it?.state === "done" && it.report.name === e.name;
              });
              const it = key === undefined ? undefined : run.items[key];
              if (key === undefined || it?.state !== "done") return null;
              return (
                <ReportEntry
                  key={e.name}
                  report={it.report}
                  defaultOpen={names.length === 1 || firstOpen === e.name}
                  settled={finished}
                  waiting={it.waiting}
                  rechecking={it.rechecking}
                  onRecheck={() => recheck(key)}
                  onCheckVariants={checkTypoVariants}
                />
              );
            })}
            {pending.map((n) => (
              <ReportSkeleton key={`p-${n}`} name={n} />
            ))}
            {failed.map((n) => {
              const it = run.items[n];
              return (
                <ReportError
                  key={`f-${n}`}
                  name={n}
                  message={it?.state === "error" ? it.message : ""}
                  onRetry={() => retry(n)}
                />
              );
            })}
          </div>

          <Legend />

          {done.length > 0 && (
            <p className="print-footer">
              Geprüft am {PRINT_DATE.format(new Date(latestCheck))} · markenfrei.app · {EXPORT_DISCLAIMER}
            </p>
          )}
        </>
      )}
    </div>
  );
}


/** Eine Zeile Ampel-Legende, erst sichtbar, wenn Ergebnisse da sind. Die ausführliche Erklärung steht unter Quellen. */
function Legend() {
  return (
    <p className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-sm text-muted">
      <span className="inline-flex items-center gap-2">
        <VerdictBadge verdict="green" size="sm" /> alle Quellen ohne Fund
      </span>
      <span className="inline-flex items-center gap-2">
        <VerdictBadge verdict="yellow" size="sm" /> ähnlich, unzulässig oder offen
      </span>
      <span className="inline-flex items-center gap-2">
        <VerdictBadge verdict="red" size="sm" /> mindestens eine Quelle
      </span>
      <Link href="/quellen#ampel" className="underline hover:text-ink">
        Mehr zur Ampel
      </Link>
    </p>
  );
}
