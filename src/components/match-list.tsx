import type { MatchKind, SourceMatch } from "@/lib/engine/types";
import { highlightMatch } from "@/lib/match-highlight";

/** Art als Chip mit Symbol UND Wort (nie nur Symbol). */
export const KIND_CHIP: Record<MatchKind, { symbol: string; word: string }> = {
  gleich: { symbol: "=", word: "gleich" },
  klanggleich: { symbol: "♪", word: "klanggleich" },
  schreibaehnlich: { symbol: "Aa", word: "schreibähnlich" },
  enthalten: { symbol: "[ ]", word: "enthalten" },
};

export const MATCH_DISCLAIMER = "Ähnlichkeit ist nur ein Hinweis, kein Rechtsbefund; kein Treffer ist keine Freigabe.";

/**
 * Ähnliche Marken zu einer Quelle: je Treffer eine Zeile mit Name, Art-Chip und den Buchstaben,
 * die mit dem eingegebenen Namen übereinstimmen (hervorgehoben, Monospace). Keine Prozentzahl,
 * kein Punktwert, keine Wertung.
 */
export function MatchList({ matches, name }: { matches: SourceMatch[]; name: string }) {
  if (matches.length === 0) return null;
  return (
    <div className="col-span-2 mt-1 rounded-md border border-line bg-surface px-3 py-2">
      <ul className="space-y-1.5">
        {matches.map((m) => {
          const k = KIND_CHIP[m.kind];
          return (
            <li key={`${m.id ?? ""}|${m.label}|${m.kind}`} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="font-mono text-sm text-ink [overflow-wrap:anywhere]">
                {highlightMatch(name, m.label).map((seg, i) =>
                  seg.match ? (
                    <mark key={i} className="rounded-sm bg-info-bg px-px font-semibold text-info underline decoration-1 underline-offset-2">
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )}
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-line-strong px-1.5 py-px text-xs text-soft">
                <span aria-hidden className="font-mono">
                  {k.symbol}
                </span>
                {k.word}
              </span>
              {m.id && <span className="font-mono text-xs text-muted">{m.id}</span>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">{MATCH_DISCLAIMER}</p>
    </div>
  );
}
