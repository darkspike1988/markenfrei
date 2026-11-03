"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CaretDown,
  Download,
  GearSix,
  Plus,
  ShieldCheck,
} from "@phosphor-icons/react";
import type { ClearanceReport } from "@/app/api/clearance/route";
import type { OpenDataWordField } from "@/lib/opendata";
import {
  LLM_STORAGE_KEY,
  getDefaultConfig,
  getProvider,
  type LlmConfig,
} from "@/lib/providers";
import { ResultRow, ResultSkeleton } from "@/components/result-row";
import { DetailPanel } from "@/components/detail-panel";
import { SettingsDialog } from "@/components/settings-dialog";

const TLDS = ["de", "com", "app", "ai", "io", "dev"];

const STYLES = [
  { id: "brandable", label: "Kunstwort" },
  { id: "portmanteau", label: "Wortkreuzung" },
  { id: "compound", label: "Zwei Wörter" },
  { id: "short", label: "Sehr kurz" },
];

const EXAMPLES = [
  "Digitales Wachbuch und Schichtplaner für Rettungswachen",
  "Terminplanung und Patientenportal für Arztpraxen",
  "Belegerfassung und Umsatzsteuer für Freelancer",
];

const field =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 focus:border-ink focus:outline-none";

type Phase = "idle" | "generating" | "checking" | "done";

type Candidate = { name: string; tagline?: string };

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export default function Home() {
  const [config, setConfig] = useState<LlmConfig>(getDefaultConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ollama, setOllama] = useState<{ running: boolean; models: string[] }>({
    running: false,
    models: [],
  });

  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [style, setStyle] = useState("brandable");
  const [tlds, setTlds] = useState<string[]>(["de", "com", "app"]);
  const [maxLen, setMaxLen] = useState(10);
  const [custom, setCustom] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [words, setWords] = useState<OpenDataWordField | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [total, setTotal] = useState(0);
  const [reports, setReports] = useState<ClearanceReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const [selected, setSelected] = useState<ClearanceReport | null>(null);

  const runId = useRef(0);
  const resultsRef = useRef<HTMLElement>(null);

  // Gespeicherte Konfiguration erst nach dem Mount lesen, damit Server- und Client-Markup übereinstimmen.
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
        /* ignore corrupt storage */
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

  useEffect(() => {
    if (!settingsOpen || config.provider !== "ollama") return;
    fetch("/api/ollama-models")
      .then((r) => r.json())
      .then(setOllama)
      .catch(() => setOllama({ running: false, models: [] }));
  }, [settingsOpen, config.provider]);

  // Wortideen (OpenThesaurus / Datamuse) nur laden, solange die Optionen offen sind.
  useEffect(() => {
    if (!optionsOpen || (!description.trim() && !keywords.trim())) return;
    const t = setTimeout(() => {
      fetch("/api/opendata-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, description, maxLen }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setWords(d))
        .catch(() => undefined);
    }, 700);
    return () => clearTimeout(t);
  }, [optionsOpen, description, keywords, maxLen]);

  const addKeyword = (word: string) => {
    const list = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const w = word.toLowerCase();
    if (!list.includes(w)) setKeywords([...list, w].join(", "));
  };

  const toggleTld = (tld: string) =>
    setTlds((cur) =>
      cur.includes(tld)
        ? cur.length > 1
          ? cur.filter((t) => t !== tld)
          : cur
        : [...cur, tld],
    );

  const generate = useCallback(
    async (customNames: string[]): Promise<Candidate[]> => {
      const call = (provider: string) =>
        fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            model: config.model,
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            description,
            keywords,
            styles: [style],
            maxLen,
            count: 10,
            exclude: customNames,
          }),
        }).then(async (r) => ({ ok: r.ok, data: await r.json() }));

      let res = await call(config.provider);
      if ((!res.ok || res.data.error) && config.provider !== "opendata") {
        setNotice(
          `${getProvider(config.provider)?.label ?? "Das Modell"} war nicht erreichbar. Die Vorschläge stammen aus der Open-Data-Engine.`,
        );
        res = await call("opendata");
      } else if (res.data.notice) {
        setNotice(res.data.notice);
      }
      if (!res.ok || res.data.error) {
        throw new Error(res.data.error ?? "Generierung fehlgeschlagen");
      }
      return res.data.candidates as Candidate[];
    },
    [config, description, keywords, style, maxLen],
  );

  const check = async (name: string): Promise<ClearanceReport | null> => {
    try {
      const res = await fetch("/api/clearance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          keywords: keywords.split(",").map((k) => k.trim()),
          tlds,
          provider: config.provider,
          apiKey: config.apiKey,
        }),
      });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };

  const run = async () => {
    const customNames = custom
      .split("\n")
      .map(clean)
      .filter((n) => n.length >= 3);

    if (!description.trim() && customNames.length === 0) {
      setError("Beschreibe kurz, was du baust, oder trage eigene Namen ein.");
      return;
    }

    const id = ++runId.current;
    setError(null);
    setNotice(null);
    setReports([]);
    setSelected(null);
    setPhase("generating");
    setTotal(0);
    requestAnimationFrame(() =>
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );

    try {
      let names = customNames;
      if (description.trim()) {
        const generated = await generate(customNames);
        names = [...customNames, ...generated.map((c) => clean(c.name))];
      }
      names = Array.from(new Set(names)).slice(0, 12);
      if (id !== runId.current) return;

      setTotal(names.length);
      setPhase("checking");

      const queue = [...names];
      const worker = async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) break;
          const report = await check(next);
          if (id !== runId.current) return;
          if (report) setReports((cur) => [...cur, report]);
          else setTotal((t) => t - 1);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (id === runId.current) setPhase("done");
    } catch (e) {
      if (id !== runId.current) return;
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      setPhase("idle");
    }
  };

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
        .map((d) => `.${d.tld} ${d.status === "available" ? "frei" : d.status === "taken" ? "vergeben" : "?"}`)
        .join(", ");
      return `| ${r.name} | ${r.matrixScore.verdict} | ${r.matrixScore.totalScore} | ${doms} | ${r.appStore.status} |`;
    });
    const md = `# MarkenFrei\n\nProjekt: ${description || "-"}\nStand: ${new Date().toLocaleString("de-DE")}\n\n| Name | Ampel | Score | Domains | App Store |\n|---|---|---|---|---|\n${rows.join("\n")}\n\nVorprüfung, keine Rechtsberatung.\n`;
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "markenfrei.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const busy = phase === "generating" || phase === "checking";
  const providerLabel =
    config.provider === "opendata"
      ? "Open-Data"
      : (getProvider(config.provider)?.label.split(" (")[0] ?? "Modell");
  const pending = phase === "checking" ? Math.max(total - reports.length, 0) : 0;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} weight="bold" aria-hidden />
          <span className="text-[15px] font-medium tracking-tight">
            MarkenFrei
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-wash hover:text-ink"
        >
          <GearSix size={16} weight="bold" aria-hidden />
          {providerLabel}
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24">
        <section className="pt-10 sm:pt-16">
          <h1 className="max-w-xl text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">
            Ein Name, der dir niemand streitig macht.
          </h1>
          <p className="mt-4 max-w-lg text-base text-muted">
            Beschreibe dein Projekt. Du bekommst Namensvorschläge, die direkt
            auf Marken, Domains, App Store und Pakete geprüft sind.
          </p>

          <div className="mt-8">
            <label htmlFor="description" className="sr-only">
              Was baust du?
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !busy) run();
              }}
              rows={3}
              placeholder="Was baust du? Zum Beispiel: Eine App, mit der Rettungswachen ihre Schichten planen."
              className="w-full resize-none rounded-lg border border-line bg-surface px-4 py-3.5 text-base placeholder:text-muted/70 focus:border-ink focus:outline-none"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
                <span className="text-muted">Beispiele:</span>
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setDescription(ex)}
                    className="cursor-pointer rounded px-1.5 py-0.5 text-soft underline-offset-2 hover:bg-wash hover:underline"
                  >
                    {["Wachbuch", "Praxis", "Buchhaltung"][i]}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={run}
                disabled={busy}
                className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-soft active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? "Prüfe…" : "Namen finden"}
                {!busy && <ArrowRight size={14} weight="bold" aria-hidden />}
              </button>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-md bg-bad-bg px-3 py-2 text-sm text-bad"
              >
                {error}
              </p>
            )}
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setOptionsOpen((o) => !o)}
              aria-expanded={optionsOpen}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
            >
              <CaretDown
                size={12}
                weight="bold"
                className={`transition-transform ${optionsOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
              Optionen
            </button>

            {optionsOpen && (
              <div className="fade-up mt-5 grid gap-6 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="keywords"
                    className="mb-1.5 block text-sm font-medium"
                  >
                    Stichwörter
                  </label>
                  <input
                    id="keywords"
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="rettung, wache, schicht"
                    className={field}
                  />
                  {words && words.germanSynonyms.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {words.germanSynonyms.slice(0, 8).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => addKeyword(w)}
                          className="inline-flex cursor-pointer items-center gap-0.5 rounded bg-wash px-1.5 py-0.5 text-xs text-soft hover:bg-line"
                        >
                          <Plus size={10} weight="bold" aria-hidden />
                          {w}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <span className="mb-1.5 block text-sm font-medium">
                    Namensstil
                  </span>
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="radiogroup"
                    aria-label="Namensstil"
                  >
                    {STYLES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={style === s.id}
                        onClick={() => setStyle(s.id)}
                        className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                          style === s.id
                            ? "border-ink bg-ink text-white"
                            : "border-line bg-surface text-soft hover:bg-wash"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block text-sm font-medium">
                    Domain-Endungen
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {TLDS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={tlds.includes(t)}
                        onClick={() => toggleTld(t)}
                        className={`cursor-pointer rounded-md border px-2.5 py-1.5 font-mono text-sm transition-colors ${
                          tlds.includes(t)
                            ? "border-ink bg-ink text-white"
                            : "border-line bg-surface text-soft hover:bg-wash"
                        }`}
                      >
                        .{t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="maxlen"
                    className="mb-1.5 flex items-center justify-between text-sm font-medium"
                  >
                    Maximale Länge
                    <span className="font-mono text-xs text-muted">
                      {maxLen} Zeichen
                    </span>
                  </label>
                  <input
                    id="maxlen"
                    type="range"
                    min={4}
                    max={16}
                    value={maxLen}
                    onChange={(e) => setMaxLen(Number(e.target.value))}
                    className="w-full accent-ink"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="custom"
                    className="mb-1.5 block text-sm font-medium"
                  >
                    Eigene Namen prüfen
                  </label>
                  <textarea
                    id="custom"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    rows={2}
                    placeholder="Ein Name pro Zeile"
                    className={`${field} resize-none font-mono`}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <section
          ref={resultsRef}
          aria-live="polite"
          className="scroll-mt-6 pt-14"
        >
          {phase !== "idle" && (
            <>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium tracking-tight">
                    {phase === "generating"
                      ? "Namen werden erzeugt…"
                      : phase === "checking"
                        ? `Prüfe ${reports.length} von ${total}…`
                        : `${visible.length} ${visible.length === 1 ? "Vorschlag" : "Vorschläge"}`}
                  </h2>
                  {notice && (
                    <p className="mt-1 max-w-lg text-sm text-warn">{notice}</p>
                  )}
                </div>

                {reports.length > 0 && (
                  <div className="flex items-center gap-4 text-sm">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-soft">
                      <input
                        type="checkbox"
                        checked={onlyFree}
                        onChange={(e) => setOnlyFree(e.target.checked)}
                        className="size-4 accent-ink"
                      />
                      Nur mit freier .de
                    </label>
                    <button
                      type="button"
                      onClick={exportMarkdown}
                      className="inline-flex cursor-pointer items-center gap-1.5 text-muted transition-colors hover:text-ink"
                    >
                      <Download size={14} weight="bold" aria-hidden />
                      Export
                    </button>
                  </div>
                )}
              </div>

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
                    count={phase === "generating" ? 4 : Math.min(pending, 3)}
                  />
                )}
              </ul>

              {phase === "done" && visible.length === 0 && (
                <p className="py-10 text-center text-sm text-muted">
                  {onlyFree
                    ? "Keiner der Namen hat eine freie .de-Domain. Filter ausschalten oder neu generieren."
                    : "Keine Ergebnisse. Versuche es mit einer anderen Beschreibung."}
                </p>
              )}

              {phase === "done" && (
                <p className="mt-6 text-xs text-muted">
                  Automatische Vorprüfung. Das ersetzt keine Markenrecherche in
                  DPMAregister oder TMview und keine Rechtsberatung.
                </p>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-5 py-6 text-xs text-muted">
        MarkenFrei ist Open Source (MIT). Daten von OpenThesaurus, Datamuse,
        RDAP, Wikidata und iTunes Search.
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
    </div>
  );
}
