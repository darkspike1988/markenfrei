"use client";

import { useId, type RefObject } from "react";
import { NAMESPACE_LABEL } from "@/lib/engine/types";
import { groupSharedRows, sharedVerdict, type SharedSnapshot } from "@/lib/snapshot-link";
import type { SourceInfo } from "@/components/checker-config";
import { StatusText, VerdictBadge } from "@/components/status-badge";

const DATE = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" });

/**
 * Ein geteilter Stand (`#stand=` im Link), nur zum Lesen: je Name die Ampel und die Status je Quelle,
 * wie sie beim Kopieren waren. Ohne Links, Hinweise und Markenblock; beim Öffnen wurde nichts abgefragt.
 */
export function SnapshotView({
  snapshot,
  sources,
  headingRef,
  onRecheck,
}: {
  snapshot: SharedSnapshot;
  /** Quellen außer Domains aus der Konfiguration, für die Beschriftungen */
  sources: readonly SourceInfo[];
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** „Jetzt neu prüfen“: normale Prüfung der Namen und Auswahl aus dem Link */
  onRecheck: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 ref={headingRef} tabIndex={-1} className="font-serif text-3xl leading-tight text-ink outline-none sm:text-4xl">
            Stand vom <time dateTime={snapshot.at}>{DATE.format(new Date(snapshot.at))}</time>
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Gespeichertes Ergebnis aus dem Link, keine neue Prüfung. Beim Öffnen wurde nichts abgefragt; die Quellen
            können heute anders antworten.
          </p>
        </div>
        <button type="button" onClick={onRecheck} className="btn btn-sm print:hidden">
          Jetzt neu prüfen
        </button>
      </div>

      <div className="space-y-3">
        {snapshot.names.map((entry) => (
          <SharedName key={entry.name} entry={entry} sources={sources} />
        ))}
      </div>

      <p className="text-xs text-muted">„Nicht gefunden“ heißt nicht „registrierbar“.</p>
    </div>
  );
}

function SharedName({ entry, sources }: { entry: SharedSnapshot["names"][number]; sources: readonly SourceInfo[] }) {
  const headingId = useId();
  const groups = groupSharedRows(entry.rows, sources);
  return (
    <section aria-labelledby={headingId} className="card px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 id={headingId} className="font-mono text-lg font-medium text-ink sm:text-xl">
          {entry.name}
        </h3>
        <VerdictBadge verdict={sharedVerdict(entry.rows)} size="sm" />
      </div>
      {groups.length > 0 && (
        <div className="mt-4 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {groups.map((g) => {
            const label = g.ns ? NAMESPACE_LABEL[g.ns] : "Weitere Quellen";
            return (
              <section key={g.ns ?? "weitere"} aria-label={label}>
                <div className="flex items-center gap-3">
                  <h4 className="eyebrow">{label}</h4>
                  <span aria-hidden className="h-px flex-1 bg-line" />
                </div>
                <ul className="mt-1">
                  {g.rows.map((r) => (
                    <li
                      key={r.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-line/70 py-2 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-ink [overflow-wrap:anywhere]">{r.label}</span>
                        {r.weak && (
                          <span className="ml-2 inline-block whitespace-nowrap rounded border border-line px-1.5 py-px text-xs text-muted">
                            schwaches Signal
                          </span>
                        )}
                      </div>
                      <StatusText status={r.status} weak={r.weak} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
