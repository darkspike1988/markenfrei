"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowsClockwise,
  CaretDown,
  Check,
  Database,
  Download,
  GearSix,
  Lightning,
  Link,
  Plus,
  ShieldCheck,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import type { ClearanceReport } from "@/app/api/clearance/route";
import {
  DEFAULT_OPEN_DATA_EXAMPLES,
  generateRandomOpenDataExamples,
  type OpenDataWordField,
} from "@/lib/opendata";
import {
  LLM_STORAGE_KEY,
  getDefaultConfig,
  getProvider,
  type LlmConfig,
} from "@/lib/providers";
import { ResultRow, ResultSkeleton } from "@/components/result-row";
import { DetailPanel } from "@/components/detail-panel";
import { SettingsDialog } from "@/components/settings-dialog";
import { InfoModal } from "@/components/info-modal";

const TLDS = ["de", "com", "app", "ai", "io", "dev"];

const STYLES = [
  { id: "brandable", label: "Kunstwort" },
  { id: "portmanteau", label: "Wortkreuzung" },
  { id: "compound", label: "Zwei Wörter" },
  { id: "short", label: "Sehr kurz" },
];

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type Phase = "idle" | "generating" | "checking" | "done";

export default function Home() {
  const [config, setConfig] = useState<LlmConfig>(getDefaultConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [examples, setExamples] = useState<Array<{ label: string; q: string }>>(
    DEFAULT_OPEN_DATA_EXAMPLES,
  );
  const [ollama, setOllama] = useState<{ running: boolean; models: string[] }>({
    running: false,
    models: [],
  });

  useEffect(() => {
    queueMicrotask(() => {
      setExamples(generateRandomOpenDataExamples(5));
    });
  }, []);

  const refreshExamples = useCallback(() => {
    setExamples(generateRandomOpenDataExamples(5));
  }, []);

  // Omnibar-Eingabe (kann ein einzelner Name oder eine Projektbeschreibung sein)
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState("brandable");
  const [tlds, setTlds] = useState<string[]>(["de", "com", "app"]);
  const [maxLen, setMaxLen] = useState(10);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [words, setWords] = useState<OpenDataWordField | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [total, setTotal] = useState(0);
  const [reports, setReports] = useState<ClearanceReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const [selected, setSelected] = useState<ClearanceReport | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const runId = useRef(0);
  const initialLoadedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  // Intent-Erkennung: Bundle-ID vs. 1 Wort (Einzelprüfung) vs. Mehrere Wörter (Generierung)
  const trimmed = query.trim();
  const isBundleId =
    trimmed.includes(".") &&
    /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(trimmed);
  const isSingleWord =
    !isBundleId &&
    trimmed.length >= 2 &&
    !trimmed.includes(" ") &&
    !trimmed.includes("\n");

  // Gespeicherte Konfiguration aus localStorage lesen
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = localStorage.getItem(LLM_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.provider && getProvider(parsed.provider)) {
            setConfig(parsed);
          }
        }
      } catch {
        /* ignore */
      }
    });
  }, []);

  const updateConfig = (next: LlmConfig) => {
    setConfig(next);
    try {
      localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };

  // Keyboard Shortcuts: ⌘K für Settings, Esc zum Schließen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSettingsOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Ollama Status prüfen
  useEffect(() => {
    if (!settingsOpen || config.provider !== "ollama") return;
    fetch("/api/ollama-models")
      .then((r) => r.json())
      .then(setOllama)
      .catch(() => setOllama({ running: false, models: [] }));
  }, [settingsOpen, config.provider]);

  // Open-Data Wortideen laden, wenn Optionen geöffnet sind
  useEffect(() => {
    if (!optionsOpen || !trimmed || isSingleWord) return;
    const t = setTimeout(() => {
      fetch("/api/opendata-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: trimmed, description: trimmed, maxLen }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setWords(d))
        .catch(() => undefined);
    }, 600);
    return () => clearTimeout(t);
  }, [optionsOpen, trimmed, isSingleWord, maxLen]);

  const toggleTld = (tld: string) =>
    setTlds((cur) =>
      cur.includes(tld)
        ? cur.length > 1
          ? cur.filter((t) => t !== tld)
          : cur
        : [...cur, tld],
    );

  // Clearance Check für einen einzelnen Namen
  const checkOne = useCallback(
    async (name: string): Promise<ClearanceReport | null> => {
      try {
        const res = await fetch("/api/clearance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: clean(name),
            description: isSingleWord ? "" : trimmed,
            keywords: isSingleWord ? [] : trimmed.split(/[\s,]+/).slice(0, 5),
            tlds,
            provider: config.provider,
            apiKey: config.apiKey,
          }),
        });
        return res.ok ? await res.json() : null;
      } catch {
        return null;
      }
    },
    [isSingleWord, trimmed, tlds, config],
  );

  // Namensideen per LLM oder Open-Data generieren
  const generateIdeas = useCallback(
    async (desc: string): Promise<string[]> => {
      const call = (provider: string) =>
        fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            model: config.model,
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            description: desc,
            keywords: desc.split(/[\s,]+/).slice(0, 5),
            styles: [style],
            maxLen,
            count: 10,
          }),
        }).then(async (r) => ({ ok: r.ok, data: await r.json() }));

      let res = await call(config.provider);
      if ((!res.ok || res.data.error) && config.provider !== "opendata") {
        setNotice(
          `${getProvider(config.provider)?.label ?? "Das gewählte Modell"} war nicht erreichbar. Die Vorschläge stammen aus der Open-Data-Engine.`,
        );
        res = await call("opendata");
      }
      if (!res.ok || res.data.error) {
        throw new Error(res.data.error ?? "Generierung fehlgeschlagen");
      }
      return (res.data.candidates || []).map((c: { name: string }) => clean(c.name));
    },
    [config, style, maxLen],
  );

  // Hauptausführung (Single-Name ODER Batch-Generierung)
  const runWithQuery = useCallback(
    async (rawInput: string) => {
      const input = rawInput.trim();
      if (!input) return;

      const id = ++runId.current;
      setError(null);
      setNotice(null);
      setReports([]);
      setSelected(null);

      // URL-Parameter aktualisieren (Shareable State)
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("q", input);
        window.history.replaceState(null, "", url.toString());
      }

      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );

      try {
        const isBundle =
          input.includes(".") &&
          /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(input);
        const isSingle = !isBundle && !input.includes(" ") && !input.includes("\n");

        if (isBundle) {
          // --- 0. BUNDLE-ID & APP-PAKET PRÜFUNG (REA BRIDGE) ---
          setPhase("checking");
          setTotal(1);

          const reaRes = await fetch("/api/rea-inspect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bundleId: input }),
          });
          const reaData = reaRes.ok ? await reaRes.json() : null;
          const targetName =
            reaData?.identity?.displayName || input.split(".").pop() || input;
          const report = await checkOne(targetName);

          if (id !== runId.current) return;
          if (report) {
            if (reaData?.stores) {
              const currentBundle = report.appStore.bundleIds?.find(
                (b) => b.bundleId === input,
              );
              if (!currentBundle) {
                report.appStore.bundleIds = [
                  {
                    bundleId: input,
                    appleStatus: reaData.stores.appleAppStore?.status || "unknown",
                    googlePlayStatus: reaData.stores.googlePlay?.status || "unknown",
                    appleApp: reaData.stores.appleAppStore?.app,
                    googlePlayUrl: reaData.stores.googlePlay?.playUrl,
                  },
                  ...(report.appStore.bundleIds || []),
                ];
              }
            }
            setReports([report]);
            setSelected(report);
          } else {
            setError(`Prüfung für Bundle-ID „${input}“ fehlgeschlagen.`);
          }
          setPhase("done");
        } else if (isSingle) {
          // --- 1. SOFORT-EINZELPRÜFUNG ---
          setPhase("checking");
          setTotal(1);
          const singleName = clean(input);
          const report = await checkOne(singleName);
          if (id !== runId.current) return;
          if (report) {
            setReports([report]);
          } else {
            setError(`Prüfung für „${singleName}“ fehlgeschlagen.`);
          }
          setPhase("done");
        } else {
          // --- 2. GENERIERUNG + BATCH-PRÜFUNG ---
          setPhase("generating");
          setTotal(0);
          const candidates = await generateIdeas(input);
          if (id !== runId.current) return;

          const unique = Array.from(new Set(candidates)).filter((n) => n.length >= 3);
          setTotal(unique.length);
          setPhase("checking");

          const queue = [...unique];
          const worker = async () => {
            while (queue.length > 0) {
              const next = queue.shift();
              if (!next) break;
              const rep = await checkOne(next);
              if (id !== runId.current) return;
              if (rep) setReports((cur) => [...cur, rep]);
              else setTotal((t) => t - 1);
            }
          };
          await Promise.all([worker(), worker(), worker()]);
          if (id === runId.current) setPhase("done");
        }
      } catch (err) {
        if (id !== runId.current) return;
        setError(err instanceof Error ? err.message : "Fehler bei der Abfrage");
        setPhase("idle");
      }
    },
    [checkOne, generateIdeas],
  );

  // Zurück zur Startseite (Logo-Klick oder Löschen)
  const resetToStart = useCallback(() => {
    runId.current += 1;
    setQuery("");
    setReports([]);
    setSelected(null);
    setError(null);
    setNotice(null);
    setPhase("idle");
    setTotal(0);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      window.history.replaceState(null, "", url.pathname);
    }
    inputRef.current?.focus();
  }, []);

  // Initialer Start via URL-Parameter ?q=... (nur 1x beim initialen Laden!)
  useEffect(() => {
    if (typeof window === "undefined" || initialLoadedRef.current) return;
    initialLoadedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const initialQ = params.get("q");
    if (initialQ && initialQ.trim()) {
      queueMicrotask(() => {
        setQuery(initialQ);
        runWithQuery(initialQ);
      });
    }
  }, [runWithQuery]);

  // Share-Link kopieren
  const copyShareLink = async () => {
    if (typeof window === "undefined") return;
    await navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Gefilterte Ergebnisse
  const visible = useMemo(() => {
    const list = onlyFree
      ? reports.filter((r) =>
          r.domains.some((d) => d.tld === "de" && d.status === "available"),
        )
      : reports;
    return [...list].sort(
      (a, b) => b.matrixScore.totalScore - a.matrixScore.totalScore,
    );
  }, [reports, onlyFree]);

  const exportMarkdown = () => {
    const rows = visible.map((r) => {
      const doms = r.domains
        .map(
          (d) =>
            `.${d.tld} ${d.status === "available" ? "frei" : d.status === "taken" ? "vergeben" : "?"}`,
        )
        .join(", ");
      return `| ${r.name} | ${r.matrixScore.verdict} | ${r.matrixScore.totalScore} | ${doms} | ${r.appStore.status} |`;
    });
    const md = `# Markenfrei Clearance-Bericht\n\nAbfrage: ${query || "-"}\nStand: ${new Date().toLocaleString("de-DE")}\n\n| Name | Ampel | Score | Domains | App Store |\n|---|---|---|---|---|\n${rows.join("\n")}\n\nVorprüfung, keine Rechtsberatung.\n`;
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `markenfrei-${clean(query || "export")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const busy = phase === "generating" || phase === "checking";
  const providerLabel =
    config.provider === "opendata"
      ? "Kostenlos (Open-Data)"
      : (getProvider(config.provider)?.label.split(" (")[0] ?? "Modell");
  const pending = phase === "checking" ? Math.max(total - reports.length, 0) : 0;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
        <button
          type="button"
          onClick={resetToStart}
          className="flex items-center gap-2.5 cursor-pointer text-left group"
          title="Markenfrei zurücksetzen (Zurück zur Startseite)"
        >
          <ShieldCheck
            size={20}
            weight="bold"
            className="text-ink transition-transform group-hover:scale-105"
            aria-hidden
          />
          <span className="text-[15px] font-medium tracking-tight text-ink group-hover:text-soft">
            Markenfrei
          </span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-wash hover:text-ink"
            title="Infos, 25+ Open APIs & MCP-Server für KI-Agenten"
          >
            <Database size={14} weight="bold" aria-hidden />
            <span>Infos & MCP</span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-wash hover:text-ink"
            title="Modell konfigurieren (⌘K)"
          >
            {config.provider === "opendata" ? (
              <span className="size-1.5 rounded-full bg-ok" aria-hidden />
            ) : (
              <GearSix size={14} weight="bold" aria-hidden />
            )}
            <span>{providerLabel}</span>
            <kbd className="hidden sm:inline rounded bg-wash px-1 py-0.5 font-mono text-[10px] text-muted border border-line">
              ⌘K
            </kbd>
          </button>
        </div>
      </header>

      {/* Main Omnibar Interface */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24">
        <section className="pt-10 sm:pt-16">
          <h1 className="max-w-xl text-3xl font-medium leading-[1.15] tracking-tight sm:text-5xl">
            Ein Name, der dir niemand streitig macht.
          </h1>
          <p className="mt-3.5 max-w-lg text-sm text-muted">
            Tippe einen Wunschnamen oder eine Projektidee ein. Direkte Vorprüfung auf
            Marken, Domains, App Store und Paket-Namensräume.
          </p>

          {/* OMNIBAR FORM */}
          <div className="mt-7">
            <div className="relative flex items-center rounded-xl border border-line bg-surface shadow-sm focus-within:border-ink focus-within:ring-1 focus-within:ring-ink transition-all">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuery(val);
                  if (!val.trim()) {
                    if (typeof window !== "undefined") {
                      const url = new URL(window.location.href);
                      url.searchParams.delete("q");
                      window.history.replaceState(null, "", url.pathname);
                    }
                    setError(null);
                    if (reports.length === 1) {
                      setReports([]);
                      setPhase("idle");
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) runWithQuery(query);
                }}
                placeholder="Name oder Idee eintippen (z. B. „WachWerk“ oder „Wachbuch für Hilfsorganisationen“)…"
                className="w-full bg-transparent px-4 py-3.5 pr-32 text-base text-ink placeholder:text-muted/60 focus:outline-none"
              />

              <div className="absolute right-2 flex items-center gap-1.5">
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      runId.current += 1;
                      setQuery("");
                      if (typeof window !== "undefined") {
                        const url = new URL(window.location.href);
                        url.searchParams.delete("q");
                        window.history.replaceState(null, "", url.pathname);
                      }
                      setError(null);
                      setReports([]);
                      setPhase("idle");
                      inputRef.current?.focus();
                    }}
                    className="cursor-pointer rounded p-1.5 text-muted transition-colors hover:bg-wash hover:text-ink"
                    title="Eingabe löschen"
                    aria-label="Eingabe löschen"
                  >
                    <X size={14} weight="bold" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => runWithQuery(query)}
                  disabled={busy || !trimmed}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-xs font-medium text-white transition-all hover:bg-soft active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>{busy ? "Prüfe…" : "Prüfen"}</span>
                  {!busy && <ArrowRight size={12} weight="bold" aria-hidden />}
                </button>
              </div>
            </div>

            {/* Smart Detection & Examples */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-1.5 text-muted">
                {trimmed ? (
                  <span className="inline-flex items-center gap-1 rounded bg-wash px-2 py-0.5 text-soft font-mono">
                    {isBundleId ? (
                      <>
                        <ShieldCheck size={12} weight="bold" className="text-ok" />
                        App-Bundle & Werktitelschutz für „{trimmed}“
                      </>
                    ) : isSingleWord ? (
                      <>
                        <Lightning size={12} weight="bold" className="text-warn" />
                        Sofort-Einzelprüfung für „{clean(trimmed)}“
                      </>
                    ) : (
                      <>
                        <Sparkle size={12} weight="bold" className="text-ok" />
                        Namensgenerierung + Batch-Prüfung
                      </>
                    )}
                  </span>
                ) : (
                  <>
                    <span className="flex items-center gap-1 text-muted">
                      <span>Zufalls-Beispiele (Open-Data):</span>
                      <button
                        type="button"
                        onClick={refreshExamples}
                        title="5 neue Zufallsnamen aus Open APIs generieren"
                        className="cursor-pointer text-muted hover:text-ink p-0.5 rounded transition-transform active:rotate-180"
                        aria-label="Neue Zufallsnamen generieren"
                      >
                        <ArrowsClockwise size={12} weight="bold" />
                      </button>
                    </span>
                    {examples.map((ex) => (
                      <button
                        key={ex.label}
                        type="button"
                        onClick={() => {
                          setQuery(ex.q);
                          runWithQuery(ex.q);
                        }}
                        className="cursor-pointer rounded px-1.5 py-0.5 text-soft underline-offset-2 hover:bg-wash hover:underline font-mono"
                      >
                        {ex.label}
                      </button>
                    ))}
                  </>
                )}
              </div>

              {/* Options Toggle */}
              <button
                type="button"
                onClick={() => setOptionsOpen((o) => !o)}
                aria-expanded={optionsOpen}
                className="inline-flex cursor-pointer items-center gap-1 text-muted transition-colors hover:text-ink"
              >
                <CaretDown
                  size={12}
                  weight="bold"
                  className={`transition-transform ${optionsOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
                Kriterien
              </button>
            </div>

            {/* Collapsible Fine-Tuning */}
            {optionsOpen && (
              <div className="fade-up mt-4 rounded-xl border border-line bg-surface/50 p-4 grid gap-4 sm:grid-cols-2 text-xs">
                <div>
                  <span className="mb-1.5 block font-medium text-soft">
                    Domain-Endungen
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {TLDS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={tlds.includes(t)}
                        onClick={() => toggleTld(t)}
                        className={`cursor-pointer rounded px-2 py-1 font-mono transition-colors ${
                          tlds.includes(t)
                            ? "bg-ink text-white"
                            : "bg-wash text-soft hover:bg-line"
                        }`}
                      >
                        .{t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block font-medium text-soft">
                    Namensstil (für Ideen)
                  </span>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup">
                    {STYLES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={style === s.id}
                        onClick={() => setStyle(s.id)}
                        className={`cursor-pointer rounded px-2 py-1 transition-colors ${
                          style === s.id
                            ? "bg-ink text-white"
                            : "bg-wash text-soft hover:bg-line"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-soft">
                      Maximale Zeichenlänge
                    </span>
                    <span className="font-mono text-muted">{maxLen} Zeichen</span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={16}
                    value={maxLen}
                    onChange={(e) => setMaxLen(Number(e.target.value))}
                    className="w-full accent-ink h-1 bg-line rounded cursor-pointer"
                  />
                </div>

                {words && words.germanSynonyms.length > 0 && (
                  <div className="sm:col-span-2 border-t border-line pt-2">
                    <span className="block text-muted mb-1">
                      Verwandte Wortideen aus OpenThesaurus:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {words.germanSynonyms.slice(0, 10).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => {
                            setQuery(w);
                            runWithQuery(w);
                          }}
                          className="inline-flex cursor-pointer items-center gap-0.5 rounded bg-wash px-1.5 py-0.5 text-soft hover:bg-line"
                        >
                          <Plus size={10} weight="bold" />
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-md bg-bad-bg px-3 py-2 text-sm text-bad"
              >
                {error}
              </p>
            )}
          </div>
        </section>

        {/* RESULTS SECTION */}
        <section ref={resultsRef} aria-live="polite" className="scroll-mt-6 pt-12">
          {phase !== "idle" && (
            <>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-medium tracking-tight">
                    {phase === "generating"
                      ? "Namensideen werden generiert…"
                      : phase === "checking"
                        ? `Prüfe ${reports.length} von ${total}…`
                        : visible.length === 1
                          ? `Clearance-Ergebnis für „${visible[0].name}“`
                          : `${visible.length} geprüfte Vorschläge`}
                  </h2>
                  {notice && <p className="mt-1 text-xs text-warn">{notice}</p>}
                </div>

                {reports.length > 0 && (
                  <div className="flex items-center gap-3 text-xs">
                    {reports.length > 1 && (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-soft">
                        <input
                          type="checkbox"
                          checked={onlyFree}
                          onChange={(e) => setOnlyFree(e.target.checked)}
                          className="size-3.5 accent-ink"
                        />
                        Nur freie .de
                      </label>
                    )}

                    <button
                      type="button"
                      onClick={copyShareLink}
                      className="inline-flex cursor-pointer items-center gap-1 text-muted hover:text-ink"
                      title="Link mit diesem Suchergebnis teilen"
                    >
                      {copiedLink ? (
                        <>
                          <Check size={13} weight="bold" className="text-ok" />
                          <span className="text-ok">Kopiert!</span>
                        </>
                      ) : (
                        <>
                          <Link size={13} weight="bold" />
                          <span>Link teilen</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={exportMarkdown}
                      className="inline-flex cursor-pointer items-center gap-1 text-muted hover:text-ink"
                      title="Als Markdown-Bericht exportieren"
                    >
                      <Download size={13} weight="bold" />
                      <span>Export</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Ergebnisliste */}
              <ul className="divide-y divide-line border-y border-line">
                {visible.map((r, i) => (
                  <ResultRow
                    key={r.name}
                    report={r}
                    index={i}
                    onOpen={() => setSelected(r)}
                  />
                ))}
                {(phase === "generating" || pending > 0) && (
                  <ResultSkeleton
                    count={phase === "generating" ? 3 : Math.min(pending, 2)}
                  />
                )}
              </ul>

              {phase === "done" && visible.length === 0 && (
                <p className="py-10 text-center text-sm text-muted">
                  {onlyFree
                    ? "Keiner der Namen hat eine freie .de-Domain."
                    : "Keine Treffer. Versuche eine andere Eingabe."}
                </p>
              )}

              {phase === "done" && (
                <p className="mt-5 text-xs text-muted">
                  Automatische Vorprüfung. Dies ersetzt keine anwaltliche Markenberatung
                  oder Recherche in DPMAregister / TMview.
                </p>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-5 py-6 text-xs text-muted flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span>Markenfrei · Open Source (MIT)</span>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="underline underline-offset-2 hover:text-ink cursor-pointer"
          >
            Infos, Open APIs & MCP-Server
          </button>
        </div>
      </footer>

      {selected && (
        <DetailPanel report={selected} onClose={() => setSelected(null)} />
      )}
      {settingsOpen && (
        <SettingsDialog
          config={config}
          onChange={updateConfig}
          onClose={() => setSettingsOpen(false)}
          ollama={ollama}
        />
      )}
      {infoOpen && <InfoModal onClose={() => setInfoOpen(false)} />}
    </div>
  );
}
