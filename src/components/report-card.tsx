"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import type { NameReport } from "@/lib/engine/check";
import type { SourceResult } from "@/lib/engine/types";
import { NAMESPACE_LABEL, NAMESPACES } from "@/lib/engine/types";
import { rankReports, STATUS_LABEL } from "@/lib/engine/verdict";
import { alternativeNames } from "@/lib/insights";
import type { Extending } from "@/components/check-run";
import { Chevron } from "@/components/chevron";
import { statusLamp, StatusText, VerdictBadge } from "@/components/status-badge";
import { MatchList } from "@/components/match-list";
import { VerdictPanel } from "@/components/verdict-panel";
import { NameInsights } from "@/components/name-insights";
import { TrademarkBlock } from "@/components/trademark-block";
import { groupNotes, hiddenNoteLead, shortlistSummary, type GroupNotes } from "@/components/verdict-text";

const DATE = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" });

export function reportAnchor(name: string): string {
  return `bericht-${name.replace(/[^a-z0-9-]/gi, "")}`;
}

export const QUIET_BUTTON = "btn-quiet";

/**
 * Eine Zeile je Quelle: Name, Status, Link. Das Ziel (z. B. Paketname) steht auf kleinen Schirmen darunter.
 * Mit `showEvidence` steht der technische Beleg der Quelle (z. B. „HTTP 404“) klein darunter. Hat die Zeile
 * einen Registrierungs-Link des Betreibers (`register`), steht er neben „prüfen“, gleich unauffällig und
 * als `sponsored` gekennzeichnet; den Hinweis dazu zeigt die Gruppe.
 */
function SourceRow({ r, name, note, showEvidence }: { r: SourceResult; name: string; note?: string; showEvidence: boolean }) {
  const showTarget = r.namespace !== "domains" && r.target !== name && r.target !== r.label;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-line/70 py-2 last:border-b-0">
      <div className="min-w-0">
        <span className="font-medium text-ink [overflow-wrap:anywhere]">{r.label}</span>
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
            className="inline-flex min-h-6 min-w-14 items-center justify-end gap-1 text-sm text-soft underline decoration-line-strong hover:text-ink hover:decoration-ink"
          >
            prüfen<span className="sr-only">: {r.label}</span>
            <svg aria-hidden viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 2h6v6M10 2 2.5 9.5" />
            </svg>
          </a>
        ) : (
          <span className="min-w-14" aria-hidden />
        )}
        {r.register && (
          <a
            href={r.register.url}
            target="_blank"
            rel="sponsored noopener"
            aria-label={`${r.register.label}: ${r.target}`}
            className="inline-flex min-h-6 items-center gap-1 text-sm text-soft underline decoration-line-strong hover:text-ink hover:decoration-ink"
          >
            registrieren
            <svg aria-hidden viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 2h6v6M10 2 2.5 9.5" />
            </svg>
          </a>
        )}
      </div>
      {note && <p className="col-span-2 text-[13px] leading-snug text-muted">{note}</p>}
      {showEvidence && r.evidence && (
        <p className="col-span-2 font-mono text-xs leading-snug text-muted [overflow-wrap:anywhere]">
          <span className="font-sans">Beleg:</span> {r.evidence}
        </p>
      )}
      {r.matches && r.matches.length > 0 && <MatchList matches={r.matches} name={name} />}
    </li>
  );
}

/** „Übrige geprüfte Endungen ansehen“ in der Gruppe Domains: was noch fehlt, Fortschritt und Fehler. */
type DomainExtension = {
  /** Kuratierte Endungen, die der Bericht noch nicht enthält */
  remaining: number;
  extending?: Extending;
  error?: string;
  onExtend: () => void;
};

/**
 * Gruppenkopf: kleine Beschriftung mit feiner Linie; Hinweise zu „nicht gefunden“ und die Belege der
 * Quellen auf Abruf. In der Gruppe Domains auf Wunsch die übrigen geprüften Endungen.
 */
function SourceGroup({
  ns,
  rows,
  name,
  findingsOnly,
  extension,
}: {
  ns: (typeof NAMESPACES)[number];
  rows: SourceResult[];
  name: string;
  findingsOnly: boolean;
  extension?: DomainExtension;
}) {
  const notesId = useId();
  const listId = useId();
  const [showHidden, setShowHidden] = useState(false);
  const notes: GroupNotes = groupNotes(rows);
  const shown = findingsOnly ? rows.filter((r) => r.status !== "not_found") : rows;
  const concealed = rows.length - shown.length;
  const hasDetails = notes.hidden.length > 0 || rows.some((r) => r.evidence);
  // Hinweis zu Registrierungs-Links nur, solange eine Zeile mit Link sichtbar ist (nicht bei „Nur Auffälliges“).
  const registerNotice = shown.find((r) => r.register)?.register?.notice;

  return (
    <section aria-label={NAMESPACE_LABEL[ns]}>
      <div className="flex items-center gap-3">
        <h4 className="eyebrow">{NAMESPACE_LABEL[ns]}</h4>
        <span aria-hidden className="h-px flex-1 bg-line" />
        {hasDetails && (
          <button
            type="button"
            aria-expanded={showHidden}
            aria-controls={shown.length > 0 ? `${notesId} ${listId}` : notesId}
            onClick={() => setShowHidden((v) => !v)}
            className="inline-flex min-h-6 items-center text-xs text-muted underline hover:text-ink"
          >
            Hinweise und Belege<span className="sr-only"> zu {NAMESPACE_LABEL[ns]}</span>
          </button>
        )}
      </div>
      {notes.shared.map((s) => (
        <p key={`${s.status}-${s.note}`} className="mt-1.5 text-[13px] leading-snug text-muted">
          {STATUS_LABEL[s.status]}: {s.note}
        </p>
      ))}
      {shown.length > 0 && (
        <ul id={listId} className="mt-1">
          {shown.map((r) => (
            <SourceRow
              key={r.sourceId}
              r={r}
              name={name}
              note={notes.inline.get(r.sourceId)}
              showEvidence={showHidden}
            />
          ))}
        </ul>
      )}
      {registerNotice && (
        <p className="mt-1.5 text-[13px] leading-snug text-muted">
          <span className="font-medium text-soft">Anzeige:</span> {registerNotice}
        </p>
      )}
      {concealed > 0 && (
        <p className="mt-1.5 text-[13px] text-muted">
          {concealed === rows.length ? "Alle" : "Weitere"} {concealed} {concealed === 1 ? "Quelle" : "Quellen"} ohne Fund
          ausgeblendet.
        </p>
      )}
      <div id={notesId} hidden={!showHidden}>
        {notes.hidden.length > 0 && (
          <ul className="mb-1 mt-2 space-y-1 border-l border-line pl-3 text-[13px] leading-snug text-muted">
            {notes.hidden.map((h) => (
              <li key={h.note}>
                <span className="font-medium text-soft">{hiddenNoteLead(h, notes.hidden.length)}:</span> {h.note}
              </li>
            ))}
          </ul>
        )}
      </div>
      {extension && (extension.remaining > 0 || extension.extending || extension.error) && (
        <div className="mt-3 space-y-1.5 print:hidden">
          {(extension.remaining > 0 || extension.extending) && (
            <button
              type="button"
              onClick={extension.onExtend}
              disabled={extension.extending !== undefined}
              className="btn btn-secondary btn-sm"
            >
              {extension.extending
                ? `Prüfe Endungen … ${extension.extending.checked} von ${extension.extending.total}`
                : `Übrige geprüfte Endungen ansehen (${extension.remaining})`}
            </button>
          )}
          {extension.error && (
            <p role="status" className="text-[13px] text-warn">
              {extension.error}
            </p>
          )}
          <p className="text-[13px] text-muted">
            Fragt nur Domains für diesen Namen ab, nacheinander. Der Link enthält diese Endungen nicht.
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Ausweichnamen bei einem Treffer oder einer Lücke: feste Muster aus `alternativeNames`, ungeprüft, bis
 * jemand „Ausweichnamen prüfen“ drückt. Vorher geht keine Anfrage hinaus.
 */
function Alternatives({ name, onCheck }: { name: string; onCheck: (original: string, alternatives: string[]) => void }) {
  const headingId = useId();
  const alternatives = useMemo(() => alternativeNames(name), [name]);
  if (alternatives.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="space-y-2 print:hidden">
      <h4 id={headingId} className="eyebrow">
        Ausweichnamen
      </h4>
      <ul className="flex flex-wrap gap-1.5">
        {alternatives.map((a) => (
          <li key={a} className="tag">
            {a}
          </li>
        ))}
      </ul>
      <p className="max-w-2xl text-[13px] text-muted">
        Nach festen Mustern gebildet und noch nicht geprüft. Ein Klick ersetzt die Liste im Namensfeld durch {name} und
        diese Namen und prüft sie.
      </p>
      <button type="button" onClick={() => onCheck(name, alternatives)} className="btn btn-secondary btn-sm">
        Ausweichnamen prüfen
      </button>
    </section>
  );
}

/**
 * Lichterkette in der Kopfzeile: je Quelle ein Segment in der Farbe ihres Status, mit Lücke zwischen den
 * Namensräumen. Reine Zierde für den schnellen Blick; dieselbe Aussage steht als Text im Urteilsfeld.
 */
function Lamps({ groups }: { groups: { ns: string; rows: SourceResult[] }[] }) {
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  let n = 0;
  return (
    <span
      aria-hidden
      className="lamps lamps-in order-5 hidden shrink-0 flex-nowrap md:flex"
      style={{ "--lamp-w": total > 26 ? "4px" : "7px" } as CSSProperties}
    >
      {groups.flatMap((g, gi) =>
        g.rows.map((r, ri) => (
          <i
            key={r.sourceId}
            title={`${r.label}: ${STATUS_LABEL[r.status]}`}
            className={`${statusLamp(r.status, r.weak)} ${gi > 0 && ri === 0 ? "lamps-gap" : ""}`}
            style={{ "--n": n++ } as CSSProperties}
          />
        )),
      )}
    </span>
  );
}

export function ReportEntry({
  report,
  defaultOpen,
  settled,
  waiting,
  rechecking,
  retryError,
  findingsOnly = false,
  onRecheck,
  onCheckVariants,
  onCheckAlternatives,
  remainingTlds = [],
  extending,
  extendError,
  onExtendTlds,
}: {
  report: NameReport;
  /** Anfangszustand; gilt endgültig, sobald `settled` und der Nutzer den Eintrag nicht selbst bedient hat */
  defaultOpen: boolean;
  /** Alle Namen der Prüfung sind fertig, die Rangfolge ändert sich nicht mehr */
  settled: boolean;
  /** Gesetzt, solange die Oberfläche offene Quellen automatisch erneut prüft */
  waiting?: { attempt: number; max: number };
  rechecking?: boolean;
  /** Die letzte Wiederholung ist gescheitert; der angezeigte Bericht stammt noch von der früheren Prüfung */
  retryError?: string;
  /** Quellen mit „nicht gefunden“ ausblenden */
  findingsOnly?: boolean;
  onRecheck?: () => void;
  /** „Tippfehler-Varianten prüfen“: Original plus gewählte Varianten als Shortlist */
  onCheckVariants?: (original: string, variants: string[]) => void;
  /** „Ausweichnamen prüfen“: Original plus Ausweichnamen als neue Shortlist; ohne diese Funktion kein Block */
  onCheckAlternatives?: (original: string, alternatives: string[]) => void;
  /** Kuratierte Endungen, die der Bericht noch nicht enthält */
  remainingTlds?: readonly string[];
  /** Gesetzt, solange weitere Endungen nachgeprüft werden */
  extending?: Extending;
  /** Das Nachprüfen weiterer Endungen ist gescheitert */
  extendError?: string;
  /** „Übrige geprüfte Endungen ansehen“ */
  onExtendTlds?: () => void;
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
      className="card fade-in scroll-mt-24"
    >
      <summary
        onClick={() => (touched.current = true)}
        className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 rounded-[1.0625rem] px-4 py-3 transition-colors hover:bg-wash/50 sm:flex-nowrap sm:px-6"
      >
        <h3 className="order-1 font-mono text-lg font-medium text-ink sm:text-xl">{report.name}</h3>
        <span className="order-2">
          <VerdictBadge verdict={report.verdict} size="sm" />
        </span>
        <span className="order-4 min-w-0 basis-full text-sm text-muted sm:order-3 sm:basis-0 sm:flex-1 sm:truncate" title={reason}>
          {reason}
          {retryError && <span className="text-warn"> · Stand {DATE.format(checkedAt)}, Neuprüfung fehlgeschlagen</span>}
        </span>
        <Lamps groups={groups} />
        <Chevron className="order-3 ml-auto text-muted sm:order-6 sm:ml-0" />
      </summary>

      <div className="space-y-6 border-t border-line px-4 pb-6 pt-5 sm:px-6">
        <VerdictPanel report={report} />

        {(report.input.trim().toLowerCase() !== report.name || report.incomplete.length > 0 || waiting || retryError) && (
          <div className="space-y-1.5 text-sm">
            {report.input.trim().toLowerCase() !== report.name && (
              <p className="text-muted">Eingabe „{report.input.trim()}“ geprüft als {report.name}.</p>
            )}
            {retryError && (
              <p role="status" className="text-warn">
                Erneute Prüfung fehlgeschlagen: {retryError} Angezeigt wird das Ergebnis vom{" "}
                <time dateTime={report.checkedAt}>{DATE.format(checkedAt)}</time>.
              </p>
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
              <button type="button" onClick={onRecheck} disabled={rechecking} className="btn btn-secondary btn-sm">
                {rechecking ? "Prüfe erneut …" : "Quellen ohne Antwort erneut prüfen"}
              </button>
            )}
          </div>
        )}

        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          {groups.map((g) => (
            <SourceGroup
              key={g.ns}
              ns={g.ns}
              rows={g.rows}
              name={report.name}
              findingsOnly={findingsOnly}
              extension={
                g.ns === "domains" && onExtendTlds
                  ? {
                      remaining: remainingTlds.length,
                      extending,
                      error: extendError,
                      // Wer hier klickt, bedient den Eintrag: er bleibt offen, auch wenn sich die Rangfolge ändert.
                      onExtend: () => {
                        touched.current = true;
                        onExtendTlds();
                      },
                    }
                  : undefined
              }
            />
          ))}
        </div>

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

        {report.verdict !== "green" && onCheckAlternatives && (
          <Alternatives name={report.name} onCheck={onCheckAlternatives} />
        )}

        <div>
          <TrademarkBlock prep={report.trademark} name={report.name} />
          <NameInsights name={report.name} onCheckVariants={onCheckVariants} />
        </div>

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
    <div className="card flex min-h-14 items-center justify-between gap-4 px-4 py-3 sm:px-6" aria-busy="true">
      <span className="font-mono text-lg text-muted sm:text-xl">{name}</span>
      <span className="skeleton text-sm text-muted">wird geprüft …</span>
    </div>
  );
}

export function ReportError({ name, message, onRetry }: { name: string; message: string; onRetry?: () => void }) {
  return (
    <div className="card px-4 py-3 sm:px-6" role="alert">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-lg text-ink sm:text-xl">{name}</span>
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn btn-secondary btn-sm">
            Erneut prüfen
          </button>
        )}
      </div>
      <p className="text-sm text-bad">{message}</p>
    </div>
  );
}
