"use client";

import type { RefObject } from "react";
import Link from "next/link";
import { EXPORT_DISCLAIMER } from "@/lib/export";
import { VERDICT_LABEL, type Verdict } from "@/lib/engine/verdict";
import { withSharedFragment } from "@/lib/snapshot-link";
import { remainingFeaturedTlds, type Run, type RunView } from "@/components/check-run";
import { Chevron } from "@/components/chevron";
import { Chip } from "@/components/chip";
import { ChangesNotice } from "@/components/changes-notice";
import { CopyButton } from "@/components/copy-button";
import { Menu } from "@/components/menu";
import { MatrixView } from "@/components/matrix-view";
import { QUIET_BUTTON, ReportEntry, ReportError, ReportSkeleton } from "@/components/report-card";
import { VerdictBadge } from "@/components/status-badge";
import { shortlistCount } from "@/components/verdict-text";

const PRINT_DATE = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" });

const TALLY: { verdict: Verdict; lamp: string }[] = [
  { verdict: "green", lamp: "lamp-ok" },
  { verdict: "yellow", lamp: "lamp-warn" },
  { verdict: "red", lamp: "lamp-bad" },
];

/**
 * Ergebnisbereich: Überschrift, Laufanzeige, Werkzeugleiste (Ansicht, Filter, Exporte), Berichtskarten,
 * Legende und Druckfußzeile. Reine Darstellung; Zustand und Aktionen kommen vom Aufrufer.
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
  exportIcs,
  openFromMatrix,
  recheck,
  retry,
  cancel,
  findingsOnly,
  onFindingsOnlyChange,
  checkTypoVariants,
  checkAlternatives,
  extendTlds,
  featuredTlds,
  notice,
  standData,
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
  exportIcs: () => void;
  openFromMatrix: (name: string) => void;
  recheck: (name: string) => void;
  retry: (name: string) => void;
  cancel: () => void;
  findingsOnly: boolean;
  onFindingsOnlyChange: (value: boolean) => void;
  checkTypoVariants: (original: string, variants: string[]) => void;
  /** „Ausweichnamen prüfen“: Original plus Ausweichnamen als neue Shortlist */
  checkAlternatives: (original: string, alternatives: string[]) => void;
  /** „Übrige geprüfte Endungen ansehen“ für den Eintrag mit diesem Schlüssel */
  extendTlds: (key: string) => void;
  featuredTlds: readonly string[];
  /** Vergleich mit der letzten Prüfung derselben Auswahl (Verlauf): Zeitpunkt und je Änderung eine Zeile */
  notice?: { at: string; lines: string[] } | null;
  /** Fertiger Stand für „Stand kopieren“ (Text hinter `#stand=`); ohne ihn keine Schaltfläche */
  standData?: string | null;
}) {
  const { names, done, pending, failed, ranking, ranked, latestCheck, finished, rechecking, extending, tally, firstOpen } =
    view;
  const showMatrix = mode === "matrix" && ranked.length > 1;
  const settled = names.length - pending.length;

  return (
    <div ref={resultsRef} className="scroll-mt-24 space-y-5">
      <p className="sr-only" aria-live="polite">
        {run
          ? finished
            ? `${done.length} von ${names.length} Namen geprüft.`
            : `Prüfe ${names.length === 1 ? "einen Namen" : `${names.length} Namen`} …`
          : ""}
      </p>

      {run && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="font-serif text-3xl leading-tight text-ink outline-none sm:text-4xl"
              >
                {names.length === 1 ? "Ergebnis" : "Ergebnisse"}
              </h2>
              {names.length > 1 && <p className="mt-1 text-sm text-muted">{shortlistCount(ranking, pending.length)}</p>}
            </div>
            {names.length > 1 && done.length > 0 && (
              <ul aria-label="Namen je Ampel" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-soft">
                {TALLY.map((t) => (
                  <li key={t.verdict} className="inline-flex items-center gap-2">
                    <span aria-hidden className={`lamp size-2.5 ${t.lamp}`} />
                    <span className="font-mono text-base font-medium tabular-nums text-ink">{tally[t.verdict]}</span>
                    {VERDICT_LABEL[t.verdict]}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(!finished || rechecking || extending) && (
            <div className="flex items-center gap-4 print:hidden">
              <div className="min-w-0 flex-1">
                <div className="progress" aria-hidden>
                  <span style={{ width: `${names.length ? (settled / names.length) * 100 : 0}%` }} />
                </div>
                <p className="mt-1.5 text-sm text-muted">
                  {!finished
                    ? `${settled} von ${names.length} ${names.length === 1 ? "Name" : "Namen"} geprüft`
                    : rechecking
                      ? "Quellen ohne Antwort werden erneut geprüft …"
                      : "Weitere Endungen werden geprüft …"}
                </p>
              </div>
              <button type="button" onClick={cancel} className="btn btn-secondary btn-sm">
                Abbrechen
              </button>
            </div>
          )}

          {done.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 print:hidden">
              <div className="flex flex-wrap items-center gap-1.5">
                {ranked.length > 1 && (
                  <div role="group" aria-label="Ansicht" className="flex gap-1.5">
                    <Chip pressed={!showMatrix} onClick={() => onViewChange("list")}>
                      Liste
                    </Chip>
                    <Chip pressed={showMatrix} onClick={() => onViewChange("matrix")}>
                      Vergleich
                    </Chip>
                  </div>
                )}
                {!showMatrix && (
                  <Chip
                    pressed={findingsOnly}
                    onClick={() => onFindingsOnlyChange(!findingsOnly)}
                    title="Blendet in den Berichten die Quellen mit „nicht gefunden“ aus"
                  >
                    Nur Auffälliges
                  </Chip>
                )}
              </div>
              <div role="group" aria-label="Weitergeben" className="-mx-1 flex flex-wrap items-center">
                <CopyButton text={() => window.location.href} label="Link kopieren" />
                {standData && (
                  <CopyButton text={() => withSharedFragment(window.location.href, standData)} label="Stand kopieren" />
                )}
                <Menu
                  className={QUIET_BUTTON}
                  items={[
                    { label: "JSON", onSelect: exportJson },
                    { label: "CSV", onSelect: exportCsv },
                    { label: "Markdown", onSelect: exportMarkdown },
                    { label: "Erinnerung (.ics)", onSelect: exportIcs },
                  ]}
                >
                  Exportieren
                  <Chevron />
                </Menu>
                <button type="button" onClick={() => window.print()} className={QUIET_BUTTON}>
                  Drucken
                </button>
              </div>
            </div>
          )}

          {notice && <ChangesNotice at={notice.at} lines={notice.lines} />}

          {showMatrix && (
            <div className="print:hidden">
              <MatrixView reports={ranked} pending={pending.length + failed.length} onOpen={openFromMatrix} />
            </div>
          )}

          <div className={`space-y-3 ${showMatrix ? "hidden print:block" : ""}`}>
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
                  retryError={it.retryError}
                  findingsOnly={findingsOnly}
                  onRecheck={() => recheck(key)}
                  onCheckVariants={checkTypoVariants}
                  onCheckAlternatives={checkAlternatives}
                  remainingTlds={remainingFeaturedTlds(it.report, featuredTlds)}
                  extending={it.extending}
                  extendError={it.extendError}
                  onExtendTlds={() => extendTlds(key)}
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
    <p className="flex flex-wrap items-center gap-x-6 gap-y-2.5 pt-1 text-sm text-muted">
      <span className="inline-flex items-center gap-2.5">
        <VerdictBadge verdict="green" size="sm" /> alle Quellen ohne Fund
      </span>
      <span className="inline-flex items-center gap-2.5">
        <VerdictBadge verdict="yellow" size="sm" /> ähnlich, unzulässig oder offen
      </span>
      <span className="inline-flex items-center gap-2.5">
        <VerdictBadge verdict="red" size="sm" /> mindestens eine Quelle
      </span>
      <Link href="/quellen#ampel" className="inline-flex min-h-6 items-center underline hover:text-ink">
        Mehr zur Ampel
      </Link>
    </p>
  );
}
