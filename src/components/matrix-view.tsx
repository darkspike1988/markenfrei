"use client";

import type { NameReport } from "@/lib/engine/check";
import { NAMESPACE_LABEL } from "@/lib/engine/types";
import { matrixCell, matrixColumns, type MatrixTone } from "@/lib/matrix";
import { reportAnchor } from "@/components/report-card";
import { VerdictBadge } from "@/components/status-badge";

/** Zeichen vor dem Text; die Aussage steht immer im Text, die Form (voll, hohl) ergänzt nur. */
const DOT: Record<MatrixTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  unknown: "border border-muted bg-transparent",
};

const CELL_LINK = "inline-flex min-h-6 items-center gap-1.5 text-sm text-ink underline-offset-4 hover:underline";

/**
 * Kompakter Vergleich der Namen: Zeilen in Rangfolge, Spalten je abgefragtem Namensraum plus Ampel.
 * Jede Zelle führt zur Berichtszeile des Namens (`onOpen` wechselt zur Liste und klappt sie auf).
 */
export function MatrixView({
  reports,
  pending,
  onOpen,
}: {
  /** Fertige Berichte in Rangfolge */
  reports: NameReport[];
  /** Anzahl der Namen, die noch geprüft werden oder fehlgeschlagen sind */
  pending: number;
  onOpen: (name: string) => void;
}) {
  const columns = matrixColumns(reports);

  return (
    <div>
      <div
        role="region"
        aria-label="Vergleich der Namen, bei Bedarf seitlich scrollbar"
        tabIndex={0}
        className="relative overflow-x-auto rounded-md border-y border-line"
      >
        <table className="w-full min-w-max border-collapse text-left">
          <caption className="sr-only">
            Vergleich der Namen in Rangfolge: Ergebnis je Namensraum und Gesamtampel. „Nichts gefunden“ heißt nicht „frei“.
          </caption>
          <thead>
            <tr className="border-b border-line text-xs font-medium uppercase tracking-wide text-muted">
              <th scope="col" className="sticky left-0 z-10 bg-canvas py-2 pr-4 font-medium">
                Name
              </th>
              {columns.map((ns) => (
                <th key={ns} scope="col" className="px-3 py-2 font-medium">
                  {NAMESPACE_LABEL[ns]}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 font-medium">
                Ampel
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {reports.map((report) => {
              const href = `#${reportAnchor(report.name)}`;
              const open = (e: React.MouseEvent) => {
                e.preventDefault();
                onOpen(report.name);
              };
              return (
                <tr key={report.name}>
                  <th scope="row" className="sticky left-0 z-10 bg-canvas py-1.5 pr-4 font-normal">
                    <a
                      href={href}
                      onClick={open}
                      className="inline-flex min-h-6 items-center font-mono text-base font-medium text-ink underline-offset-4 hover:underline"
                    >
                      {report.name}
                    </a>
                  </th>
                  {columns.map((ns) => {
                    const cell = matrixCell(report.results, ns);
                    return (
                      <td key={ns} className="px-3 py-1.5 align-middle">
                        {cell ? (
                          <a
                            href={href}
                            onClick={open}
                            className={CELL_LINK}
                          >
                            <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT[cell.tone]}`} />
                            <span>{cell.text}</span>
                          </a>
                        ) : (
                          <span className="text-sm text-muted">nicht abgefragt</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 align-middle">
                    <a
                      href={href}
                      onClick={open}
                      className="inline-flex min-h-6 items-center"
                    >
                      <VerdictBadge verdict={report.verdict} size="sm" />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pending > 0 && (
        <p className="mt-2 text-sm text-muted">
          {pending === 1 ? "Ein Name ist" : `${pending} Namen sind`} noch nicht im Vergleich (Prüfung läuft oder
          ist fehlgeschlagen).
        </p>
      )}
    </div>
  );
}
