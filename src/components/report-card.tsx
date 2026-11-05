"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { NameReport } from "@/lib/engine/check";
import type { SourceResult } from "@/lib/engine/types";
import { NAMESPACE_LABEL, NAMESPACES } from "@/lib/engine/types";
import { rankReports, STATUS_LABEL } from "@/lib/engine/verdict";
import { Chevron } from "@/components/chevron";
import { StatusText, VerdictBadge } from "@/components/status-badge";
import { NameInsights } from "@/components/name-insights";
import { TrademarkBlock } from "@/components/trademark-block";
import { groupNotes, hiddenNoteLead, shortlistSummary, type GroupNotes } from "@/components/verdict-text";

const DATE = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" });

export function reportAnchor(name: string): string {
  return `bericht-${name.replace(/[^a-z0-9-]/gi, "")}`;
}

export const QUIET_BUTTON =
  "inline-flex min-h-6 items-center text-sm text-soft underline hover:text-ink disabled:cursor-wait disabled:opacity-60";

/** Eine Zeile je Quelle: Name, Status, Link. Das Ziel (z. B. Paketname) steht auf kleinen Schirmen darunter. */
function SourceRow({ r, name, note }: { r: SourceResult; name: string; note?: string }) {
  const showTarget = r.namespace !== "domains" && r.target !== name && r.target !== r.label;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-1.5">
      <div className="min-w-0">
        <span className="whitespace-nowrap font-medium text-ink">{r.label}</span>
        {r.weak && (
          <span className="ml-2 inline-block whitespace-nowrap rounded border border-line px-1.5 py-px text-xs text-muted">
            schwaches Signal
          </span>
        )}
        {showTarget && (
          <span className="block font-mono text-[13px] leading-snug text-muted [overflow-wrap:anywhere] sm:ml-2 sm:inline">
            {r.target}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StatusText status={r.status} weak={r.weak} />
        {r.url ? (
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-6 min-w-12 items-center justify-end text-sm text-soft underline hover:text-ink"
          >
            prüfen<span className="sr-only">: {r.label}</span>
          </a>
        ) : (
          <span className="min-w-12" aria-hidden />
        )}
      </div>
      {note && <p className="col-span-2 text-[13px] leading-snug text-muted">{note}</p>}
    </li>
  );
}

/** Gruppenkopf: kleine Beschriftung mit feiner Linie; Hinweise zu „nicht gefunden“ auf Abruf. */
function SourceGroup({ ns, rows, name }: { ns: (typeof NAMESPACES)[number]; rows: SourceResult[]; name: string }) {
  const notesId = useId();
  const [showHidden, setShowHidden] = useState(false);
  const notes: GroupNotes = groupNotes(rows);

  return (
    <section aria-label={NAMESPACE_LABEL[ns]}>
      <div className="flex items-center gap-3">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted">{NAMESPACE_LABEL[ns]}</h4>
        <span aria-hidden className="h-px flex-1 bg-line" />
        {notes.hidden.length > 0 && (
          <button
            type="button"
            aria-expanded={showHidden}
            aria-controls={notesId}
            onClick={() => setShowHidden((v) => !v)}
            className="inline-flex min-h-6 items-center text-xs text-muted underline hover:text-ink"
          >
            Hinweise<span className="sr-only"> zu {NAMESPACE_LABEL[ns]}</span>
          </button>
        )}
      </div>
      {notes.shared.map((s) => (
        <p key={`${s.status}-${s.note}`} className="mt-1.5 text-[13px] leading-snug text-muted">
          {STATUS_LABEL[s.status]}: {s.note}
        </p>
      ))}
      <ul>
        {rows.map((r) => (
          <SourceRow key={r.sourceId} r={r} name={name} note={notes.inline.get(r.sourceId)} />
        ))}
      </ul>
      <div id={notesId} hidden={!showHidden}>
        {notes.hidden.length > 0 && (
          <ul className="mb-1 space-y-1 border-l border-line pl-3 text-[13px] leading-snug text-muted">
            {notes.hidden.map((h) => (
              <li key={h.note}>
                <span className="font-medium text-soft">{hiddenNoteLead(h, notes.hidden.length)}:</span> {h.note}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function ReportEntry({
  report,
  defaultOpen,
  settled,
  waiting,
  rechecking,
  onRecheck,
  onCheckVariants,
}: {
  report: NameReport;
  /** Anfangszustand; gilt endgültig, sobald `settled` und der Nutzer den Eintrag nicht selbst bedient hat */
  defaultOpen: boolean;
  /** Alle Namen der Prüfung sind fertig, die Rangfolge ändert sich nicht mehr */
  settled: boolean;
  /** Gesetzt, solange die Oberfläche offene Quellen automatisch erneut prüft */
  waiting?: { attempt: number; max: number };
  rechecking?: boolean;
  onRecheck?: () => void;
  /** „Tippfehler-Varianten prüfen“: Original plus gewählte Varianten als Shortlist */
  onCheckVariants?: (original: string, variants: string[]) => void;
}) {
  const anchor = reportAnchor(report.name);
  const [open, setOpen] = useState(defaultOpen);
  const touched = useRef(false);

  // Sobald alle Namen fertig sind, gilt die endgültige Rangfolge; was der Nutzer selbst auf- oder zugeklappt hat, bleibt.
  useEffect(() => {
    if (settled && !touched.current) setOpen(defaultOpen);
  }, [settled, defaultOpen]);

  // Link mit #bericht-… öffnet den Eintrag, auf den er zeigt.
  useEffect(() => {
    const check = () => {
      if (window.location.hash === `#${anchor}`) {
        touched.current = true;
        setOpen(true);
      }
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [anchor]);

  const groups = NAMESPACES.map((ns) => ({ ns, rows: report.results.filter((r) => r.namespace === ns) })).filter(
    (g) => g.rows.length > 0,
  );
  const reason = shortlistSummary(rankReports([report])[0]);
  const checkedAt = new Date(report.checkedAt);

  return (
    <details
      id={anchor}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="fade-in scroll-mt-6"
    >
      <summary
        onClick={() => (touched.current = true)}
        className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5 sm:flex-nowrap"
      >
        <h3 className="order-1 font-mono text-base font-medium text-ink sm:text-lg">{report.name}</h3>
        <span className="order-2">
          <VerdictBadge verdict={report.verdict} size="sm" />
        </span>
        <span className="order-4 min-w-0 basis-full text-sm text-muted sm:order-3 sm:basis-0 sm:flex-1 sm:truncate" title={reason}>
          {reason}
        </span>
        <Chevron className="order-3 ml-auto text-muted sm:order-4" />
      </summary>

      <div className="space-y-4 pb-5">
        {(report.input.trim().toLowerCase() !== report.name || report.incomplete.length > 0 || waiting) && (
          <div className="space-y-1.5 text-sm">
            {report.input.trim().toLowerCase() !== report.name && (
              <p className="text-muted">Eingabe „{report.input.trim()}“ geprüft als {report.name}.</p>
            )}
            {report.incomplete.length > 0 && (
              <p className="text-warn">
                Ohne Antwort: {report.incomplete.join(", ")}. Dort heißt „nichts gefunden“ nicht „frei“.
              </p>
            )}
            {waiting && (
              <p role="status" className="text-soft">
                Einige Quellen haben ihr Abfragelimit erreicht oder waren zu langsam. Markenfrei prüft sie
                automatisch erneut, nur diese (Versuch {waiting.attempt} von {waiting.max}).
              </p>
            )}
            {!waiting && report.incomplete.length > 0 && onRecheck && (
              <button type="button" onClick={onRecheck} disabled={rechecking} className={QUIET_BUTTON}>
                {rechecking ? "Prüfe erneut …" : "Quellen ohne Antwort erneut prüfen"}
              </button>
            )}
          </div>
        )}

        {groups.map((g) => (
          <SourceGroup key={g.ns} ns={g.ns} rows={g.rows} name={report.name} />
        ))}

        {report.manualLinks.length > 0 && (
          <p className="text-sm text-muted">
            Selbst prüfen:{" "}
            {report.manualLinks.map((l, i) => (
              <span key={l.url}>
                {i > 0 && ", "}
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                  {l.label}
                </a>
              </span>
            ))}
          </p>
        )}

        <TrademarkBlock prep={report.trademark} name={report.name} />
        <NameInsights name={report.name} onCheckVariants={onCheckVariants} />

        <p className="text-xs text-muted">
          „Nicht gefunden“ heißt nicht „registrierbar“. Geprüft am{" "}
          <time dateTime={report.checkedAt}>{DATE.format(checkedAt)}</time>.
        </p>
      </div>
    </details>
  );
}

/** Platzhalter in der Höhe einer Zeile, damit nichts springt, wenn das Ergebnis eintrifft. */
export function ReportSkeleton({ name }: { name: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2.5" aria-busy="true">
      <span className="font-mono text-base text-muted sm:text-lg">{name}</span>
      <span className="skeleton text-sm text-muted">wird geprüft …</span>
    </div>
  );
}

export function ReportError({ name, message, onRetry }: { name: string; message: string; onRetry?: () => void }) {
  return (
    <div className="py-2.5" role="alert">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-base text-ink sm:text-lg">{name}</span>
        {onRetry && (
          <button type="button" onClick={onRetry} className={QUIET_BUTTON}>
            Erneut prüfen
          </button>
        )}
      </div>
      <p className="text-sm text-bad">{message}</p>
    </div>
  );
}
