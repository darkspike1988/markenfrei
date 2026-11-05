"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { NameReport } from "@/lib/engine/check";
import type { Namespace } from "@/lib/engine/types";
import { NAMESPACE_LABEL } from "@/lib/engine/types";
import { rankReports } from "@/lib/engine/verdict";
import { trackEvent } from "@/lib/analytics";
import {
  buildQuery,
  buildRequestBody,
  groupOptional,
  hasAnySource,
  parseSelection,
  selectionSummary,
  splitNames,
  type CheckerConfig,
  type Selection,
  type SourceInfo,
} from "@/components/checker-config";
import { Chevron } from "@/components/chevron";
import { CopyButton } from "@/components/copy-button";
import { IdeaFinder } from "@/components/idea-finder";
import { QUIET_BUTTON, ReportEntry, ReportError, ReportSkeleton } from "@/components/report-card";
import { VerdictBadge } from "@/components/status-badge";
import { shortlistCount } from "@/components/verdict-text";

const CONCURRENCY = 3;

/**
 * Quellen mit vorübergehendem "unknown" (Abfragelimit, Zeitüberschreitung) werden automatisch erneut
 * geprüft. Eindeutige Quellen kommen dabei aus dem Zwischenspeicher des Servers, es werden nur die
 * offenen neu abgefragt. Abstand wächst, damit ein Dienst mit Limit Luft bekommt.
 */
const MAX_AUTO_RETRIES = 6;
const retryDelayMs = (attempt: number) => 4000 + attempt * 2500 + Math.random() * 1500;

type Waiting = { attempt: number; max: number };

type Item =
  | { state: "loading" }
  | { state: "done"; report: NameReport; waiting?: Waiting; rechecking?: boolean }
  | { state: "error"; message: string };

type Run = { id: number; sel: Selection; items: Record<string, Item> };

/** Liest den Zustand aus dem Link. Muss in einer Suspense-Grenze stehen. */
export function CheckerFromUrl({ config }: { config: CheckerConfig }) {
  const params = useSearchParams();
  const initial = parseSelection(new URLSearchParams(params.toString()), config);
  return <Checker config={config} initial={initial} />;
}

/** Platzhalter bis zur Hydrierung: gleiche Oberfläche, Absenden noch gesperrt. */
export function CheckerFallback({ config }: { config: CheckerConfig }) {
  return <Checker config={config} initial={parseSelection(new URLSearchParams(), config)} inert />;
}

function Chip({
  pressed,
  onClick,
  disabled,
  children,
  mono,
  title,
}: {
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  mono?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-8 items-center rounded-md border px-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        mono ? "font-mono" : ""
      } ${
        pressed
          ? "border-button bg-button text-button-ink hover:bg-button-hover"
          : "border-line-strong bg-surface text-soft hover:border-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function Checker({
  config,
  initial,
  inert = false,
}: {
  config: CheckerConfig;
  initial: Selection;
  inert?: boolean;
}) {
  const fieldId = useId();
  const hintId = useId();
  const errorId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** Lauf-ID, für die nach dem Rendern Fokus und Ansicht zu den Ergebnissen wandern sollen */
  const revealFor = useRef<number | null>(null);

  const [text, setText] = useState(() => initial.names.join(", "));
  const [namespaces, setNamespaces] = useState<Namespace[]>(initial.namespaces);
  const [tlds, setTlds] = useState<string[]>(initial.tlds);
  const [extra, setExtra] = useState<string[]>(initial.extra);
  const [formError, setFormError] = useState("");
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

  const optionalGroups = useMemo(() => groupOptional(config.sources), [config.sources]);

  async function checkOne(name: string, sel: Selection, signal: AbortSignal, id: number) {
    let item: Item;
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody(name, sel, config)),
        signal,
      });
      const json = (await res.json().catch(() => null)) as { error?: string; reports?: NameReport[] } | null;
      if (!res.ok || !json?.reports?.[0]) {
        item = { state: "error", message: json?.error ?? `Die Prüfung ist fehlgeschlagen (HTTP ${res.status}).` };
      } else {
        item = { state: "done", report: json.reports[0] };
        const retryable = json.reports[0].results.some((r) => r.retryable);
        const attempt = (retryAttempts.current.get(name) ?? 0) + 1;
        if (retryable && attempt <= MAX_AUTO_RETRIES) {
          retryAttempts.current.set(name, attempt);
          item = { ...item, waiting: { attempt, max: MAX_AUTO_RETRIES } };
          const t = setTimeout(() => {
            retryTimers.current.delete(t);
            if (runId.current === id && !signal.aborted) void checkOne(name, sel, signal, id);
          }, retryDelayMs(attempt));
          retryTimers.current.add(t);
        } else {
          retryAttempts.current.delete(name);
          trackEvent(`ergebnis/${json.reports[0].verdict}`);
        }
      }
    } catch {
      if (signal.aborted) return;
      item = { state: "error", message: "Keine Verbindung zum Server. Bitte erneut versuchen." };
    }
    if (runId.current !== id) return;
    setRun((r) => (r && r.id === id ? { ...r, items: { ...r.items, [name]: item } } : r));
  }

  function start(sel: Selection, reveal = false) {
    abort.current?.abort();
    clearRetries();
    const ac = new AbortController();
    abort.current = ac;
    const id = ++runId.current;
    revealFor.current = reveal ? id : null;
    if (reveal) trackEvent("pruefung");
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

  function submitNames(names: string[]) {
    if (names.length === 0) {
      setFormError("Bitte mindestens einen Namen eingeben.");
      fieldRef.current?.focus();
      return;
    }
    if (names.length > config.maxNames) {
      setFormError(`Höchstens ${config.maxNames} Namen auf einmal, eingegeben sind ${names.length}.`);
      fieldRef.current?.focus();
      return;
    }
    const sel: Selection = { names, namespaces, tlds, extra };
    if (!hasAnySource(sel)) {
      setFormError("Bitte mindestens einen Namensraum oder eine weitere Quelle wählen.");
      return;
    }
    setFormError("");
    start(sel, true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inert) return;
    submitNames(splitNames(text));
  }

  // Link mit ?q=… prüft beim Öffnen sofort (nur einmal).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (inert || autoStarted.current) return;
    autoStarted.current = true;
    if (initial.names.length && initial.names.length <= config.maxNames && hasAnySource(initial)) {
      queueMicrotask(() => start(initial));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      abort.current?.abort();
      clearRetries();
    },
    [],
  );

  // Nach „Prüfen“ (nicht beim automatischen Start über ?q=) Fokus auf die Ergebnis-Überschrift
  // setzen und den Bereich zeigen, wenn er außerhalb des sichtbaren Ausschnitts liegt.
  const currentRunId = run?.id;
  useEffect(() => {
    if (currentRunId === undefined || revealFor.current !== currentRunId) return;
    revealFor.current = null;
    const heading = headingRef.current;
    const area = resultsRef.current;
    if (!heading || !area) return;
    heading.focus({ preventScroll: true });
    const top = heading.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      area.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, [currentRunId]);

  function toggleNs(ns: Namespace) {
    setNamespaces((cur) => (cur.includes(ns) ? cur.filter((x) => x !== ns) : [...cur, ns]));
  }
  function toggleTld(t: string) {
    if (!tlds.includes(t)) trackEvent(`endung/${t}`);
    setTlds((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : cur.length >= config.maxTlds ? cur : [...cur, t],
    );
  }
  function toggleExtra(id: string) {
    if (!extra.includes(id)) trackEvent(`quelle/${id}`);
    setExtra((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function applyIdeas(names: string[]) {
    const list = names.slice(0, config.maxNames);
    setText(list.join(", "));
    submitNames(list);
  }

  function exportJson() {
    if (!run) return;
    trackEvent("export/json");
    const reports = run.sel.names
      .map((n) => run.items[n])
      .filter((i): i is Extract<Item, { state: "done" }> => i?.state === "done")
      .map((i) => i.report);
    const data = {
      tool: "Markenfrei",
      note: "Vorprüfung, keine Rechtsberatung. Marke nicht geprüft.",
      exportedAt: new Date().toISOString(),
      query: { names: run.sel.names, namespaces: run.sel.namespaces, tlds: run.sel.tlds, sources: run.sel.extra },
      ranking: rankReports(reports),
      reports,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `markenfrei-${reports.length === 1 ? reports[0].name : "shortlist"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Abgeleitete Ergebnisdaten
  const names = run?.sel.names ?? [];
  const done: NameReport[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const it = run?.items[n];
    if (it?.state === "done" && !seen.has(it.report.name)) {
      seen.add(it.report.name);
      done.push(it.report);
    }
  }
  const pending = names.filter((n) => run?.items[n]?.state === "loading");
  const failed = names.filter((n) => run?.items[n]?.state === "error");
  const ranking = rankReports(done);
  const finished = run !== null && pending.length === 0;
  const domainsOn = namespaces.includes("domains");
  /** Beim Einhängen offen: bei mehreren Namen der erste mit Treffer oder Lücke (Rangfolge), sonst nichts */
  const firstOpen = ranking.find((e) => e.verdict !== "green")?.name;

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} noValidate aria-label="Namen prüfen" className="space-y-4">
        <div>
          <label htmlFor={fieldId} className="mb-2 block text-sm font-medium text-ink">
            Name oder Shortlist
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <textarea
              id={fieldId}
              ref={fieldRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
              spellCheck={false}
              autoCapitalize="none"
              autoComplete="off"
              placeholder="z. B. wachwerk oder wachwerk, schichtflux, planzeit"
              aria-describedby={`${hintId}${formError ? ` ${errorId}` : ""}`}
              aria-invalid={formError ? true : undefined}
              className="auto-grow w-full flex-1 resize-none rounded-lg border border-line-strong bg-surface px-3.5 py-3 font-mono text-base text-ink placeholder:font-sans placeholder:text-muted hover:border-muted"
            />
            <button
              type="submit"
              disabled={inert}
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg bg-button px-6 font-medium text-button-ink transition-colors hover:bg-button-hover active:scale-[0.98] disabled:opacity-60"
            >
              Prüfen
            </button>
          </div>
          <p id={hintId} className="mt-2 text-sm text-muted">
            Bis zu {config.maxNames} Namen, mit Komma getrennt
          </p>
          {formError && (
            <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-bad">
              {formError}
            </p>
          )}
        </div>

        <details>
          <summary className="flex min-h-8 items-center justify-between gap-3 text-sm">
            <span className="min-w-0 text-muted">{selectionSummary({ namespaces, tlds, extra }, config)}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-soft underline hover:text-ink">
              Anpassen
              <Chevron />
            </span>
          </summary>

          <div className="mt-3 space-y-5 border-t border-line pt-4">
            <fieldset>
              <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Namensräume</legend>
              <div className="flex flex-wrap gap-1.5">
                {config.namespaces.map((n) => (
                  <Chip key={n.id} pressed={namespaces.includes(n.id)} onClick={() => toggleNs(n.id)}>
                    {n.label}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset disabled={!domainsOn} className="disabled:opacity-60">
              <legend className="mb-2 flex w-full flex-wrap items-baseline justify-between gap-x-3 text-xs font-medium uppercase tracking-wide text-muted">
                <span>Endungen</span>
                <span className="font-normal normal-case tracking-normal">
                  {domainsOn ? `${tlds.length} von höchstens ${config.maxTlds}` : "Domains abgewählt"}
                </span>
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {tlds.map((t) => (
                  <Chip key={t} pressed onClick={() => toggleTld(t)} mono>
                    .{t}
                    <span className="sr-only"> (abwählen)</span>
                  </Chip>
                ))}
              </div>
              <details className="mt-2">
                <summary className="inline-flex min-h-8 items-center gap-1.5 text-sm text-soft hover:text-ink">
                  <span aria-hidden className="toggle-sign" />
                  Alle {config.tlds.length} Endungen
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {config.tlds.map((t) => (
                    <Chip
                      key={t}
                      mono
                      pressed={tlds.includes(t)}
                      disabled={!tlds.includes(t) && tlds.length >= config.maxTlds}
                      onClick={() => toggleTld(t)}
                    >
                      .{t}
                    </Chip>
                  ))}
                </div>
              </details>
            </fieldset>

            {optionalGroups.length > 0 && (
              <fieldset>
                <legend className="mb-1 flex w-full flex-wrap items-baseline justify-between gap-x-3 text-xs font-medium uppercase tracking-wide text-muted">
                  <span>Weitere Quellen</span>
                  <span className="font-normal normal-case tracking-normal">
                    {extra.length > 0 ? `${extra.length} gewählt` : "keine gewählt"}
                  </span>
                </legend>
                <div className="divide-y divide-line border-y border-line">
                  {optionalGroups.map((g) => (
                    <ExtraGroup key={g.ns} ns={g.ns} list={g.list} extra={extra} onToggle={toggleExtra} />
                  ))}
                </div>
                <p className="mt-2 text-[13px] text-muted">
                  Was jede Quelle prüft, steht unter{" "}
                  <Link href="/quellen" className="underline hover:text-ink">
                    Quellen
                  </Link>
                  .
                </p>
              </fieldset>
            )}
          </div>
        </details>
      </form>

      <div ref={resultsRef} className="scroll-mt-6 space-y-3">
        <p className="sr-only" aria-live="polite">
          {run
            ? finished
              ? `${done.length} von ${names.length} Namen geprüft.`
              : `Prüfe ${names.length === 1 ? "einen Namen" : `${names.length} Namen`} …`
            : ""}
        </p>

        {run && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 ref={headingRef} tabIndex={-1} className="font-serif text-2xl tracking-tight text-ink outline-none">
                  {names.length === 1 ? "Ergebnis" : "Ergebnisse"}
                </h2>
                {names.length > 1 && <p className="text-sm text-muted">{shortlistCount(ranking, pending.length)}</p>}
              </div>
              {done.length > 0 && (
                <div className="flex flex-wrap gap-x-4">
                  <CopyButton text={() => window.location.href} label="Link kopieren" />
                  <button type="button" onClick={exportJson} className={QUIET_BUTTON}>
                    JSON exportieren
                  </button>
                </div>
              )}
            </div>

            <div className="divide-y divide-line border-y border-line">
              {ranking.map((e) => {
                const key = names.find((n) => {
                  const it = run.items[n];
                  return it?.state === "done" && it.report.name === e.name;
                });
                const it = key === undefined ? undefined : run.items[key];
                if (key === undefined || it?.state !== "done") return null;
                return (
                  <ReportEntry
                    key={e.name}
                    report={it.report}
                    defaultOpen={names.length === 1 || firstOpen === e.name}
                    settled={finished}
                    waiting={it.waiting}
                    rechecking={it.rechecking}
                    onRecheck={() => recheck(key)}
                  />
                );
              })}
              {pending.map((n) => (
                <ReportSkeleton key={`p-${n}`} name={n} />
              ))}
              {failed.map((n) => {
                const it = run.items[n];
                return (
                  <ReportError
                    key={`f-${n}`}
                    name={n}
                    message={it?.state === "error" ? it.message : ""}
                    onRetry={() => retry(n)}
                  />
                );
              })}
            </div>

            <Legend />
          </>
        )}
      </div>

      <IdeaFinder max={config.maxNames} onUse={applyIdeas} />
    </div>
  );
}

/** Zusatzquellen eines Namensraums als einzeilige Chip-Reihe, eingeklappt mit Zähler („Pakete +14“). */
function ExtraGroup({
  ns,
  list,
  extra,
  onToggle,
}: {
  ns: Namespace;
  list: SourceInfo[];
  extra: string[];
  onToggle: (id: string) => void;
}) {
  const chosen = list.filter((s) => extra.includes(s.id)).length;
  const [open, setOpen] = useState(chosen > 0);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex min-h-9 items-center justify-between gap-3 text-sm">
        <span>
          <span className="font-medium text-ink">{NAMESPACE_LABEL[ns]}</span>{" "}
          <span className="text-muted">+{list.length}</span>
          {chosen > 0 && <span className="text-muted"> · {chosen} gewählt</span>}
        </span>
        <Chevron className="text-muted" />
      </summary>
      <div className="flex flex-wrap gap-1.5 pb-3 pt-1">
        {list.map((s) => (
          <Chip key={s.id} pressed={extra.includes(s.id)} onClick={() => onToggle(s.id)} title={s.description}>
            {s.label}
          </Chip>
        ))}
      </div>
    </details>
  );
}

/** Eine Zeile Ampel-Legende, erst sichtbar, wenn Ergebnisse da sind. Die ausführliche Erklärung steht unter Quellen. */
function Legend() {
  return (
    <p className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-sm text-muted">
      <span className="inline-flex items-center gap-2">
        <VerdictBadge verdict="green" size="sm" /> alle Quellen ohne Fund
      </span>
      <span className="inline-flex items-center gap-2">
        <VerdictBadge verdict="yellow" size="sm" /> ähnlich, unzulässig oder offen
      </span>
      <span className="inline-flex items-center gap-2">
        <VerdictBadge verdict="red" size="sm" /> mindestens eine Quelle
      </span>
      <Link href="/quellen#ampel" className="underline hover:text-ink">
        Mehr zur Ampel
      </Link>
    </p>
  );
}
