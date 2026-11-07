import { Fragment } from "react";
import type { NameReport } from "@/lib/engine/check";
import { VERDICT_LABEL, rankReports, type Verdict } from "@/lib/engine/verdict";
import { buildVerdictBar, type BarKey } from "@/lib/verdict-bar";
import { shortlistSummary } from "@/components/verdict-text";

/** Farbe + Symbol + Wort je Ampel (nie nur Farbe). Symbole sind verschieden geformt: Kreis, Dreieck, Kreuz. */
const PANEL: Record<Verdict, { box: string; symbol: string; word: string }> = {
  green: { box: "border-ok bg-ok-bg text-ok", symbol: "○", word: "Grün" },
  yellow: { box: "border-warn bg-warn-bg text-warn", symbol: "▲", word: "Gelb" },
  red: { box: "border-bad bg-bad-bg text-bad", symbol: "✕", word: "Rot" },
};

const SEGMENT_STYLE: Record<BarKey, string> = {
  taken: "bg-bad",
  similar: "bg-warn",
  not_found: "bg-ok",
  // Schraffur (siehe .bar-hatch in globals.css): unbekannt darf nicht wie Grün wirken
  unknown: "bar-hatch",
};

/** Gegliederter Balken nach Anzahl der Quellen. Jedes Segment hat Text im Label, nicht nur Farbe. */
export function VerdictBarView({ results }: { results: NameReport["results"] }) {
  const bar = buildVerdictBar(results);
  if (bar.total === 0) return null;
  return (
    <div
      role="img"
      aria-label={bar.ariaLabel}
      className="flex h-3 w-full overflow-hidden rounded border border-line-strong bg-surface"
    >
      {bar.segments
        .filter((s) => s.count > 0)
        .map((s) => (
          <span
            key={s.key}
            title={`${s.count} ${s.label}`}
            style={{ flexGrow: s.count, flexBasis: 0 }}
            className={`min-w-1 border-r border-surface last:border-r-0 ${SEGMENT_STYLE[s.key]}`}
          />
        ))}
    </div>
  );
}

/**
 * Urteilsfeld oben in der Berichtskarte: Ampel mit Farbe, Symbol und Text, ein Satz aus den
 * vorhandenen Texten und die Zählung der Quellen. Keine Prozente, kein Punktwert.
 */
export function VerdictPanel({ report }: { report: NameReport }) {
  const s = PANEL[report.verdict];
  const bar = buildVerdictBar(report.results);
  const reason = shortlistSummary(rankReports([report])[0]);
  return (
    <div data-testid="verdict-panel" className={`rounded-lg border-l-4 px-4 py-3 ${s.box}`}>
      <p className="flex items-center gap-3 text-lg font-semibold sm:text-xl">
        <span aria-hidden className="text-2xl leading-none">
          {s.symbol}
        </span>
        <span>
          <span className="sr-only">Ampel {s.word}: </span>
          {VERDICT_LABEL[report.verdict]}
        </span>
      </p>
      <p className="mt-1 text-sm text-ink">{reason}</p>
      <p className="mt-2 text-sm text-ink">
        {bar.countText.split(" · ").map((part, i, all) => (
          // Jede Angabe ist unteilbar; das Trennzeichen hängt an ihr, das Leerzeichen DAZWISCHEN liegt
          // außerhalb der Hülle, sonst gäbe es keine Umbruchstelle und die Zeile liefe über.
          <Fragment key={i}>
            <span className="whitespace-nowrap">
              {part}
              {i < all.length - 1 ? " ·" : ""}
            </span>
            {i < all.length - 1 ? " " : ""}
          </Fragment>
        ))}
      </p>
      <div className="mt-2">
        <VerdictBarView results={report.results} />
      </div>
      <p className="mt-2 text-xs text-soft">„Nicht gefunden“ heißt nicht „registrierbar“. Der Balken zählt Quellen, er bewertet nichts.</p>
    </div>
  );
}
