import type { NameReport } from "@/lib/engine/check";
import type { SourceResult } from "@/lib/engine/types";
import { NAMESPACE_LABEL, NAMESPACES } from "@/lib/engine/types";
import { StatusText, VerdictBadge } from "@/components/status-badge";
import { TrademarkBlock } from "@/components/trademark-block";

const DATE = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" });

export function reportAnchor(name: string): string {
  return `bericht-${name.replace(/[^a-z0-9-]/gi, "")}`;
}

function SourceRow({ r, name, hideNote }: { r: SourceResult; name: string; hideNote?: boolean }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-0.5 px-4 py-2.5 sm:px-5">
      <div className="min-w-0">
        <span className="font-medium text-ink">{r.label}</span>
        {r.namespace !== "domains" && r.target !== name && r.target !== r.label && (
          <span className="ml-2 font-mono text-[13px] text-muted">{r.target}</span>
        )}
        {r.weak && (
          <span className="ml-2 inline-block rounded border border-line px-1.5 py-px text-xs text-muted">
            schwaches Signal
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
      {r.note && !hideNote && (
        <p className="col-span-2 text-[13px] leading-snug text-muted sm:col-span-1">{r.note}</p>
      )}
    </li>
  );
}

export function ReportCard({
  report,
  waiting,
  rechecking,
  onRecheck,
}: {
  report: NameReport;
  /** Gesetzt, solange die Oberfläche offene Quellen automatisch erneut prüft */
  waiting?: { attempt: number; max: number };
  rechecking?: boolean;
  onRecheck?: () => void;
}) {
  const groups = NAMESPACES.map((ns) => {
    const rows = report.results.filter((r) => r.namespace === ns);
    // Gleicher Hinweis in allen Zeilen (typisch bei Domains): einmal unter der Überschrift statt je Zeile
    const shared = rows.length > 1 && rows[0].note && rows.every((r) => r.note === rows[0].note) ? rows[0].note : undefined;
    return { ns, rows, shared };
  }).filter((g) => g.rows.length > 0);
  const checkedAt = new Date(report.checkedAt);

  return (
    <article
      id={reportAnchor(report.name)}
      aria-labelledby={`${reportAnchor(report.name)}-titel`}
      className="fade-in scroll-mt-6 overflow-hidden rounded-xl border border-line bg-surface"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-3 pt-4 sm:px-5">
        <h3 id={`${reportAnchor(report.name)}-titel`} className="font-mono text-lg font-medium text-ink">
          {report.name}
        </h3>
        <VerdictBadge verdict={report.verdict} />
      </header>

      <div className="space-y-2 px-4 pb-3 text-sm sm:px-5">
        {report.input.trim().toLowerCase() !== report.name && (
          <p className="text-muted">Eingabe „{report.input.trim()}“ geprüft als {report.name}.</p>
        )}
        {report.incomplete.length > 0 && (
          <p className="rounded-md bg-warn-bg px-3 py-2 text-warn">
            Ohne Antwort: {report.incomplete.join(", ")}. Dort heißt „nichts gefunden“ nicht „frei“.
          </p>
        )}
        {waiting && (
          <p role="status" className="rounded-md border border-line px-3 py-2 text-soft">
            Einige Quellen haben ihr Abfragelimit erreicht oder waren zu langsam. Markenfrei prüft sie automatisch
            erneut, nur diese (Versuch {waiting.attempt} von {waiting.max}).
          </p>
        )}
        {!waiting && report.incomplete.length > 0 && onRecheck && (
          <button
            type="button"
            onClick={onRecheck}
            disabled={rechecking}
            className="inline-flex min-h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-sm text-ink hover:bg-wash disabled:cursor-wait disabled:opacity-60"
          >
            {rechecking ? "Prüfe erneut …" : "Quellen ohne Antwort erneut prüfen"}
          </button>
        )}
      </div>

      {groups.map((g) => (
        <section key={g.ns} aria-label={NAMESPACE_LABEL[g.ns]} className="border-t border-line">
          <h4 className="bg-wash px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted sm:px-5">
            {NAMESPACE_LABEL[g.ns]}
          </h4>
          {g.shared && <p className="px-4 pt-2 text-[13px] leading-snug text-muted sm:px-5">Alle: {g.shared}</p>}
          <ul className="divide-y divide-line">
            {g.rows.map((r) => (
              <SourceRow key={r.sourceId} r={r} name={report.name} hideNote={Boolean(g.shared)} />
            ))}
          </ul>
        </section>
      ))}

      {report.manualLinks.length > 0 && (
        <p className="border-t border-line px-4 py-3 text-sm text-muted sm:px-5">
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

      <footer className="border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5">
        Geprüft am <time dateTime={report.checkedAt}>{DATE.format(checkedAt)}</time>
      </footer>
    </article>
  );
}

export function ReportSkeleton({ name }: { name: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface" aria-busy="true">
      <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
        <span className="font-mono text-lg text-muted">{name}</span>
        <span className="text-sm text-muted">wird geprüft …</span>
      </div>
      <div className="skeleton space-y-2 border-t border-line px-4 py-4 sm:px-5" aria-hidden>
        <div className="h-3 w-2/3 rounded bg-wash" />
        <div className="h-3 w-1/2 rounded bg-wash" />
        <div className="h-3 w-3/5 rounded bg-wash" />
      </div>
    </div>
  );
}

export function ReportError({ name, message, onRetry }: { name: string; message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-4 sm:px-5" role="alert">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-lg text-ink">{name}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-8 items-center rounded-md border border-line-strong px-3 text-sm hover:bg-wash"
          >
            Erneut prüfen
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-bad">{message}</p>
    </div>
  );
}
