import type { ShortlistEntry } from "@/lib/engine/verdict";
import { VerdictBadge } from "@/components/status-badge";
import { reportAnchor } from "@/components/report-card";

function summary(e: ShortlistEntry): string {
  if (e.freeInAll) return "frei in allen gewählten Quellen";
  const parts: string[] = [];
  if (e.taken.length) parts.push(`vergeben: ${e.taken.join(", ")}`);
  if (e.unknown.length) parts.push(`ohne Antwort: ${e.unknown.join(", ")}`);
  return parts.join(" · ") || "ähnliche oder schwache Treffer prüfen";
}

export function ShortlistRanking({
  ranking,
  pending,
  failed,
}: {
  ranking: ShortlistEntry[];
  pending: string[];
  failed: string[];
}) {
  const free = ranking.filter((e) => e.freeInAll).length;
  return (
    <section aria-labelledby="rangliste" className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-4 sm:px-5">
        <h2 id="rangliste" className="font-medium text-ink">
          Rangliste
        </h2>
        <p className="text-sm text-muted">
          {free === 1 ? "1 Name" : `${free} Namen`} frei in allen gewählten Quellen
        </p>
      </header>
      <ol className="mt-3 divide-y divide-line border-t border-line">
        {ranking.map((e, i) => (
          <li key={e.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:px-5">
            <span className="w-5 text-right font-mono text-sm text-muted">{i + 1}</span>
            <a href={`#${reportAnchor(e.name)}`} className="font-mono font-medium text-ink underline-offset-4 hover:underline">
              {e.name}
            </a>
            <VerdictBadge verdict={e.verdict} size="sm" />
            <span className="basis-full pl-8 text-[13px] leading-snug text-muted">
              {summary(e)}
            </span>
          </li>
        ))}
        {pending.map((n) => (
          <li key={`p-${n}`} className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted sm:px-5">
            <span className="w-5" />
            <span className="font-mono">{n}</span>
            <span>wird geprüft …</span>
          </li>
        ))}
        {failed.map((n) => (
          <li key={`f-${n}`} className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted sm:px-5">
            <span className="w-5" />
            <span className="font-mono">{n}</span>
            <span>nicht geprüft (Fehler)</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
