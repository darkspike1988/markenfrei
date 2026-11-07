"use client";

import { useEffect, useRef, useState } from "react";
import type { NameReport } from "@/lib/engine/check";
import { trackEvent } from "@/lib/analytics";
import { buildQuery, buildRequestBody, type CheckerConfig, type Selection } from "@/components/checker-config";
import { nextItem, type Item, type Outcome, type Run, type Waiting } from "@/components/check-run";

const CONCURRENCY = 3;

/**
 * Quellen mit vorübergehendem "unknown" (Abfragelimit, Zeitüberschreitung) werden automatisch erneut
 * geprüft. Eindeutige Quellen kommen dabei aus dem Zwischenspeicher des Servers, es werden nur die
 * offenen neu abgefragt. Abstand wächst, damit ein Dienst mit Limit Luft bekommt.
 */
const MAX_AUTO_RETRIES = 6;
const retryDelayMs = (attempt: number) => 4000 + attempt * 2500 + Math.random() * 1500;

/**
 * Zustand und Ablauf eines Prüflaufs: Anfragen an /api/check (höchstens CONCURRENCY gleichzeitig),
 * automatische Wiederholung bei vorübergehenden Lücken, Abbruch beim Neustart und beim Verlassen.
 */
export function useCheckRun(config: CheckerConfig) {
  const [run, setRun] = useState<Run | null>(null);
  const runId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const retryAttempts = useRef(new Map<string, number>());
  const retryTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  function clearRetries() {
    retryTimers.current.forEach(clearTimeout);
    retryTimers.current.clear();
    retryAttempts.current.clear();
  }

  async function checkOne(name: string, sel: Selection, signal: AbortSignal, id: number) {
    let outcome: Outcome;
    let waiting: Waiting | undefined;
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody(name, sel, config)),
        signal,
      });
      const json = (await res.json().catch(() => null)) as { error?: string; reports?: NameReport[] } | null;
      if (!res.ok || !json?.reports?.[0]) {
        outcome = { ok: false, message: json?.error ?? `Die Prüfung ist fehlgeschlagen (HTTP ${res.status}).` };
      } else {
        const report = json.reports[0];
        outcome = { ok: true, report };
        const retryable = report.results.some((r) => r.retryable);
        const attempt = (retryAttempts.current.get(name) ?? 0) + 1;
        if (retryable && attempt <= MAX_AUTO_RETRIES) {
          retryAttempts.current.set(name, attempt);
          waiting = { attempt, max: MAX_AUTO_RETRIES };
          const t = setTimeout(() => {
            retryTimers.current.delete(t);
            if (runId.current === id && !signal.aborted) void checkOne(name, sel, signal, id);
          }, retryDelayMs(attempt));
          retryTimers.current.add(t);
        } else {
          retryAttempts.current.delete(name);
          trackEvent(`ergebnis/${report.verdict}`);
        }
      }
    } catch {
      if (signal.aborted) return;
      outcome = { ok: false, message: "Keine Verbindung zum Server. Bitte erneut versuchen." };
    }
    if (runId.current !== id) return;
    setRun((r) => {
      if (!r || r.id !== id) return r;
      const next = nextItem(r.items[name], outcome);
      const item = waiting && next.state === "done" ? { ...next, waiting } : next;
      return { ...r, items: { ...r.items, [name]: item } };
    });
  }

  /** Startet einen neuen Lauf und gibt dessen ID zurück. */
  function start(sel: Selection): number {
    abort.current?.abort();
    clearRetries();
    const ac = new AbortController();
    abort.current = ac;
    const id = ++runId.current;
    setRun({ id, sel, items: Object.fromEntries(sel.names.map((n) => [n, { state: "loading" } as Item])) });

    const qs = buildQuery(sel, config);
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);

    const queue = [...sel.names];
    const worker = async () => {
      for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
        await checkOne(n, sel, ac.signal, id);
      }
    };
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    return id;
  }

  /** Offene Quellen eines fertigen Berichts von Hand erneut prüfen (nach den automatischen Versuchen). */
  function recheck(name: string) {
    if (!run || !abort.current) return;
    const { id, sel } = run;
    retryAttempts.current.delete(name);
    setRun((r) => {
      const cur = r?.items[name];
      if (!r || r.id !== id || !cur || cur.state !== "done") return r;
      return { ...r, items: { ...r.items, [name]: { ...cur, rechecking: true } } };
    });
    void checkOne(name, sel, abort.current.signal, id);
  }

  function retry(name: string) {
    if (!run || !abort.current) return;
    const { id, sel } = run;
    setRun((r) => (r && r.id === id ? { ...r, items: { ...r.items, [name]: { state: "loading" } } } : r));
    void checkOne(name, sel, abort.current.signal, id);
  }

  useEffect(
    () => () => {
      abort.current?.abort();
      clearRetries();
    },
    [],
  );

  return { run, start, recheck, retry };
}
