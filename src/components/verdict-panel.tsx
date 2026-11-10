import { Fragment } from "react";
import type { NameReport } from "@/lib/engine/check";
import { VERDICT_LABEL, rankReports, type Verdict } from "@/lib/engine/verdict";
import { buildVerdictBar, type BarKey } from "@/lib/verdict-bar";
import { shortlistSummary } from "@/components/verdict-text";

/** Farbe + Symbol + Wort je Ampel (nie nur Farbe). Symbole sind verschieden geformt: Kreis, Dreieck, Kreuz. */
const PANEL: Record<Verdict, { box: string; symbol: string; word: string }> = {
  green: { box: "border-ok/35 bg-ok-bg text-ok", symbol: "○", word: "Grün" },
  yellow: { box: "border-warn/35 bg-warn-bg text-warn", symbol: "▲", word: "Gelb" },
  red: { box: "border-bad/35 bg-bad-bg text-bad", symbol: "✕", word: "Rot" },
};

const SEGMENT_STYLE: Record<BarKey, string> = {
  taken: "bg-lamp-bad",
  similar: "bg-lamp-warn",
  not_found: "bg-lamp-ok",
  // Schraffur (siehe .bar-hatch in globals.css): unbekannt darf nicht wie Grün wirken
  unknown: "bar-hatch",
};

/** Gegliederter Balken nach Anzahl der Quellen. Jedes Segment hat Text im Label, nicht nur Farbe. */
export function VerdictBarView({ results }: { results: NameReport["results"] }) {
  const bar = buildVerdictBar(results);
  if (bar.total === 0) return null;
  return (
    <div role="img" aria-label={bar.ariaLabel} className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
      {bar.segments
        .filter((s) => s.count > 0)
        .map((s) => (
          <span
            key={s.key}
            title={`${s.count} ${s.label}`}
            style={{ flexGrow: s.count, flexBasis: 0 }}
            className={`min-w-1.5 rounded-[2px] ${SEGMENT_STYLE[s.key]}`}
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
    <div data-testid="verdict-panel" className={`rounded-2xl border px-4 py-4 sm:px-6 sm:py-5 ${s.box}`}>
      <p className="flex items-center gap-3 font-serif text-2xl font-medium leading-tight tracking-[-0.02em] sm:text-[1.75rem]">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] border-current font-sans text-base leading-none sm:size-10"
        >
          {s.symbol}
        </span>
        <span>
          <span className="sr-only">Ampel {s.word}: </span>
          {VERDICT_LABEL[report.verdict]}
        </span>
      </p>
      <p className="mt-2.5 text-[15px] text-ink">{reason}</p>
      <div className="mt-3.5">
        <VerdictBarView results={report.results} />
      </div>
      <p className="mt-2 font-mono text-[13px] text-ink">
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
      <p className="mt-3 text-xs text-soft">
        „Nicht gefunden“ heißt nicht „registrierbar“. Der Balken zählt Quellen, er bewertet nichts.
      </p>
    </div>
  );
}
