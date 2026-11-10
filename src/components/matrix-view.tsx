"use client";

import type { NameReport } from "@/lib/engine/check";
import { NAMESPACE_LABEL } from "@/lib/engine/types";
import { matrixCell, matrixColumns, type MatrixTone } from "@/lib/matrix";
import { reportAnchor } from "@/components/report-card";
import { VerdictBadge } from "@/components/status-badge";

/** Zeichen vor dem Text; die Aussage steht immer im Text, die Form (voll, hohl) ergänzt nur. */
const DOT: Record<MatrixTone, string> = {
  ok: "lamp-ok",
  warn: "lamp-warn",
  bad: "lamp-bad",
  unknown: "lamp-unknown",
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
        className="card relative overflow-x-auto"
      >
        <table className="w-full min-w-max border-collapse text-left">
          <caption className="sr-only">
            Vergleich der Namen in Rangfolge: Ergebnis je Namensraum und Gesamtampel. „Nichts gefunden“ heißt nicht „frei“.
          </caption>
          <thead>
            <tr className="eyebrow border-b border-line">
              <th scope="col" className="sticky left-0 z-10 bg-surface py-3 pl-4 pr-4 font-medium sm:pl-6">
                Name
              </th>
              {columns.map((ns) => (
                <th key={ns} scope="col" className="px-3 py-3 font-medium">
                  {NAMESPACE_LABEL[ns]}
                </th>
              ))}
              <th scope="col" className="py-3 pl-3 pr-4 font-medium sm:pr-6">
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
                  <th scope="row" className="sticky left-0 z-10 bg-surface py-2.5 pl-4 pr-4 font-normal sm:pl-6">
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
                      <td key={ns} className="px-3 py-2.5 align-middle">
                        {cell ? (
                          <a
                            href={href}
                            onClick={open}
                            className={CELL_LINK}
                          >
                            <span aria-hidden className={`lamp size-2 ${DOT[cell.tone]}`} />
                            <span>{cell.text}</span>
                          </a>
                        ) : (
                          <span className="text-sm text-muted">nicht abgefragt</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2.5 pl-3 pr-4 align-middle sm:pr-6">
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
