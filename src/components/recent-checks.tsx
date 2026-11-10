"use client";

import { useMemo, useRef, useSyncExternalStore } from "react";
import { Chevron } from "@/components/chevron";
import {
  addHistory,
  HISTORY_KEY,
  historyNames,
  MAX_HISTORY,
  parseHistory,
  setHistoryResults,
  type HistorySnapshot,
} from "@/lib/history";

const DATE = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Prüfungen in einem anderen Tab erscheinen hier ohne Neuladen.
  const onStorage = (e: StorageEvent) => {
    if (e.key === HISTORY_KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Roher Eintrag; `null` heißt Verlauf aus (oder Speicher gesperrt). */
function getSnapshot(): string | null {
  try {
    return localStorage.getItem(HISTORY_KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

/** Schreibt (oder entfernt bei `null`) den Eintrag und meldet es allen Anzeigen in diesem Tab. */
function store(value: string | null) {
  try {
    if (value === null) localStorage.removeItem(HISTORY_KEY);
    else localStorage.setItem(HISTORY_KEY, value);
  } catch {
    return;
  }
  for (const l of listeners) l();
}

/** Ergebnis einer früheren Prüfung derselben Auswahl, mit dem eine Wiederholung verglichen wird. */
export type CheckBaseline = { at: string; results: HistorySnapshot };

/**
 * Merkt sich eine Prüfung (Query-Teil des Links), aber nur, wenn der Verlauf eingeschaltet ist. Ohne
 * Eintrag unter HISTORY_KEY wird nichts geschrieben. Gibt Zeitpunkt und Ergebnis der letzten Prüfung
 * derselben Auswahl zurück, bevor dieser Eintrag ersetzt wird (`null` ohne gespeichertes Ergebnis).
 */
export function recordCheck(query: string, at = new Date().toISOString()): CheckBaseline | null {
  const raw = getSnapshot();
  if (raw === null) return null;
  const entries = parseHistory(raw) ?? [];
  const previous = entries.find((e) => e.query === query);
  store(JSON.stringify(addHistory(entries, query, at)));
  return previous?.results ? { at: previous.at, results: previous.results } : null;
}

/** Legt das Ergebnis einer fertigen Prüfung im Eintrag dieser Auswahl ab; ohne Verlauf oder Eintrag nichts. */
export function recordResults(query: string, results: HistorySnapshot) {
  const raw = getSnapshot();
  if (raw === null) return;
  const entries = parseHistory(raw) ?? [];
  if (!entries.some((e) => e.query === query)) return;
  const next = JSON.stringify(setHistoryResults(entries, query, results));
  if (next !== raw) store(next);
}

/** „Zuletzt geprüft“: Verlauf nur auf diesem Gerät und nur, wenn eingeschaltet. Ein Klick prüft erneut. */
export function RecentChecks({ onUse }: { onUse: (query: string) => void }) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Einträge ohne Namen (fremder oder alter Inhalt) ergäben eine leere Schaltfläche; sie bleiben unsichtbar.
  const entries = useMemo(
    () =>
      parseHistory(raw)
        ?.map((entry) => ({ entry, names: historyNames(entry) }))
        .filter((e) => e.names.length > 0) ?? null,
    [raw],
  );
  // Nach Ein- oder Ausschalten verschwindet die geklickte Schaltfläche; der Fokus bleibt im Bereich.
  const bodyRef = useRef<HTMLDivElement>(null);

  function toggle(value: string | null) {
    store(value);
    bodyRef.current?.focus();
  }

  return (
    <details className="card">
      <summary className="flex min-h-16 items-center gap-3 rounded-[1.0625rem] px-4 py-3 transition-colors hover:bg-wash/50 sm:px-5">
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">Zuletzt geprüft</span>
          <span className="block text-sm text-muted">Nur auf diesem Gerät, nur wenn eingeschaltet</span>
        </span>
        <Chevron className="text-muted" />
      </summary>
      <div ref={bodyRef} tabIndex={-1} className="space-y-4 border-t border-line px-4 pb-5 pt-4 outline-none sm:px-5">
        {entries === null ? (
          <>
            <p className="text-sm text-muted">
              Der Verlauf ist aus. Wenn du ihn einschaltest, merkt sich dein Browser die letzten {MAX_HISTORY} Prüfungen
              (Namen, Auswahl, Zeitpunkt und den Status je Quelle) auf diesem Gerät. Nichts davon geht an den Server.
            </p>
            <button type="button" onClick={() => toggle("[]")} className="btn btn-secondary btn-sm">
              Verlauf einschalten
            </button>
          </>
        ) : (
          <>
            {entries.length === 0 ? (
              <p className="text-sm text-muted">Noch keine Prüfung gemerkt.</p>
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {entries.map(({ entry, names }, i) => (
                  <li key={`${i}:${entry.query}`}>
                    <button
                      type="button"
                      onClick={() => onUse(entry.query)}
                      className="flex w-full flex-wrap items-baseline justify-between gap-x-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-wash"
                    >
                      <span className="min-w-0 break-words font-mono text-sm text-ink">{names.join(", ")}</span>
                      <time dateTime={entry.at} className="shrink-0 text-xs text-muted">
                        {DATE.format(new Date(entry.at))}
                      </time>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => toggle(null)} className="btn btn-secondary btn-sm">
              Verlauf löschen und ausschalten
            </button>
          </>
        )}
      </div>
    </details>
  );
}
