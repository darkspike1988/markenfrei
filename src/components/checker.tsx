"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Namespace } from "@/lib/engine/types";
import { exportFileName, toCsv, toMarkdown } from "@/lib/export";
import { buildReminderIcs } from "@/lib/ics";
import { buildShortlist, MAX_TYPO_CHECK } from "@/lib/insights";
import { trackEvent } from "@/lib/analytics";
import {
  buildQuery,
  hasAnySource,
  parseSelection,
  previewNames,
  type CheckerConfig,
  type Selection,
} from "@/components/checker-config";
import { buildJsonExport, deriveRun } from "@/components/check-run";
import { CheckerForm } from "@/components/check-form";
import { CheckResults } from "@/components/check-results";
import { downloadFile } from "@/components/download";
import { IdeaFinder } from "@/components/idea-finder";
import { recordCheck, RecentChecks } from "@/components/recent-checks";
import { reportAnchor } from "@/components/report-card";
import { useCheckRun } from "@/components/use-check-run";
import { usePrintExpand } from "@/components/use-print-expand";
import { VariantPicker } from "@/components/variant-picker";

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

/**
 * Der Prüfer: hält die Eingaben (Text, Namensräume, Endungen, Zusatzquellen) und die Ansicht und
 * verbindet Formular (CheckerForm), Prüflauf (useCheckRun) und Ergebnisse (CheckResults).
 */
export function Checker({
  config,
  initial,
  inert = false,
}: {
  config: CheckerConfig;
  initial: Selection;
  inert?: boolean;
}) {
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
  const [mode, setMode] = useState<"list" | "matrix">("list");
  /** „Nur Auffälliges“: blendet in den Berichten die Zeilen „nicht gefunden“ aus */
  const [findingsOnly, setFindingsOnly] = useState(false);
  /** Anker, zu dem nach dem Wechsel von der Vergleichsansicht zur Liste gesprungen wird */
  const jumpTo = useRef<string | null>(null);

  const { run, start, recheck, retry, cancel } = useCheckRun(config);
  usePrintExpand(resultsRef);
  const view = deriveRun(run);

  // Der Signalgeber im Seitenkopf folgt dem Lauf: Lampen laufen während der Prüfung, danach leuchtet
  // die des schlechtesten Ergebnisses. Reine Zierde, die Aussage steht immer als Text im Ergebnis.
  const signal = view.signal;
  useEffect(() => {
    if (inert) return;
    const root = document.documentElement;
    if (signal) root.dataset.signal = signal;
    else delete root.dataset.signal;
    return () => {
      delete root.dataset.signal;
    };
  }, [signal, inert]);

  /**
   * Startet einen Lauf; mit reveal wandern danach Fokus und Ansicht zu den Ergebnissen. Jeder Lauf (auch der
   * automatische über ?q=) landet im Verlauf, sofern der eingeschaltet ist.
   */
  function startRun(sel: Selection, reveal = false) {
    const id = start(sel);
    revealFor.current = reveal ? id : null;
    if (reveal) trackEvent("pruefung");
    const query = buildQuery(sel, config);
    if (query) recordCheck(query);
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
    startRun(sel, true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inert) return;
    // Eingaben, die denselben Namen ergeben („Wach Werk“, „wachwerk“), nur einmal abfragen.
    submitNames(
      previewNames(text)
        .filter((p) => !p.duplicate)
        .map((p) => p.input),
    );
  }

  // Link mit ?q=… prüft beim Öffnen sofort (nur einmal).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (inert || autoStarted.current) return;
    autoStarted.current = true;
    if (initial.names.length && initial.names.length <= config.maxNames && hasAnySource(initial)) {
      queueMicrotask(() => startRun(initial));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Von der Vergleichsansicht zur Berichtszeile: Die Liste ist erst nach dem Wechsel sichtbar, erst dann
  // kann der Anker scrollen. Der Eintrag öffnet sich über das hashchange-Ereignis (siehe ReportEntry).
  useEffect(() => {
    const anchor = jumpTo.current;
    if (mode !== "list" || !anchor) return;
    jumpTo.current = null;
    if (window.location.hash === `#${anchor}`) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    window.location.hash = anchor;
  }, [mode]);

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

  /** Übernimmt eine gespeicherte Auswahl (Verlauf) vollständig ins Formular und prüft sie. */
  function applySelection(sel: Selection) {
    setText(sel.names.join(", "));
    setNamespaces(sel.namespaces);
    setTlds(sel.tlds);
    setExtra(sel.extra);
    setFormError("");
    startRun(sel, true);
  }

  /** Eintrag aus „Zuletzt geprüft“: unbrauchbare Einträge (keine oder zu viele Namen, keine Quelle) tun nichts. */
  function checkRecent(query: string) {
    const sel = parseSelection(new URLSearchParams(query), config);
    if (inert || sel.names.length === 0 || sel.names.length > config.maxNames || !hasAnySource(sel)) return;
    applySelection(sel);
  }

  /** „Tippfehler-Varianten prüfen“ aus einem Bericht: Original zuerst, dann die gewählten Varianten. */
  function checkTypoVariants(original: string, variants: string[]) {
    trackEvent("varianten/tippfehler");
    applyIdeas(buildShortlist(original, variants.slice(0, MAX_TYPO_CHECK), config.maxNames).names);
  }

  function exportJson() {
    if (!run) return;
    trackEvent("export/json");
    const { data, reports } = buildJsonExport(run, new Date().toISOString());
    downloadFile(exportFileName(reports, "json"), "application/json", JSON.stringify(data, null, 2));
  }

  function exportCsv() {
    trackEvent("export/csv");
    downloadFile(exportFileName(view.ranked, "csv"), "text/csv;charset=utf-8", toCsv(view.ranked));
  }

  function exportMarkdown() {
    trackEvent("export/markdown");
    downloadFile(exportFileName(view.ranked, "md"), "text/markdown;charset=utf-8", toMarkdown(view.ranked));
  }

  function exportIcs() {
    const names = view.ranked.map((r) => r.name);
    const url = new URL("/", window.location.origin);
    url.searchParams.set("q", names.join(","));
    const ics = buildReminderIcs({
      names,
      now: new Date(),
      uid: crypto.randomUUID(),
      url: url.toString().replace(/%2C/gi, ","),
    });
    downloadFile(exportFileName(view.ranked, "ics"), "text/calendar;charset=utf-8", ics);
  }

  function openFromMatrix(name: string) {
    jumpTo.current = reportAnchor(name);
    setMode("list");
  }

  return (
    <div className="space-y-10">
      <CheckerForm
        config={config}
        inert={inert}
        text={text}
        onTextChange={setText}
        fieldRef={fieldRef}
        formError={formError}
        namespaces={namespaces}
        tlds={tlds}
        extra={extra}
        onSubmit={onSubmit}
        onToggleNs={toggleNs}
        onToggleTld={toggleTld}
        onToggleExtra={toggleExtra}
      />

      <CheckResults
        run={run}
        view={view}
        mode={mode}
        onViewChange={setMode}
        resultsRef={resultsRef}
        headingRef={headingRef}
        exportJson={exportJson}
        exportCsv={exportCsv}
        exportMarkdown={exportMarkdown}
        exportIcs={exportIcs}
        openFromMatrix={openFromMatrix}
        recheck={recheck}
        retry={retry}
        cancel={cancel}
        findingsOnly={findingsOnly}
        onFindingsOnlyChange={setFindingsOnly}
        checkTypoVariants={checkTypoVariants}
      />

      <div className="grid items-start gap-3 md:grid-cols-2 lg:grid-cols-3 print:hidden">
        <IdeaFinder max={config.maxNames} onUse={applyIdeas} />
        <VariantPicker text={text} max={config.maxNames} onUse={applyIdeas} />
        <RecentChecks onUse={checkRecent} />
      </div>
    </div>
  );
}
