"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Search,
  Sparkles,
  Cpu,
  Key,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ArrowRight,
  RefreshCw,
  Sliders,
  Copy,
  Download,
  Share2,
  Globe,
  Layers,
  BookOpen,
  Terminal,
  Smartphone,
  GitBranch,
  Package,
  FileText,
  Volume2,
  Trash2,
  Plus,
  Play,
  Settings,
  Scale,
} from "lucide-react";
import {
  PROVIDERS,
  type ProviderId,
  type LlmConfig,
  LLM_STORAGE_KEY,
  getDefaultConfig,
  getProvider,
} from "@/lib/providers";
import type { ClearanceReport, TldCheckResult } from "@/app/api/clearance/route";
import type { OpenDataWordField } from "@/lib/opendata";

const PRESET_EXAMPLES = [
  {
    title: "🚒 Rettungswache Dienstplan",
    desc: "Digitales Wachbuch und Schichtplaner für Rettungsdienst, Feuerwehr und Hilfsorganisationen mit Übergabeprotokoll.",
    kws: "rettung, wache, einsatz, schicht, fahrt, protokol",
    seed: "WachWerk",
  },
  {
    title: "🩺 Praxis & Privat-Health",
    desc: "Patientenportal und Terminkoordination für Arztpraxen und Therapeuten mit DSGVO-konformer Telemedizin.",
    kws: "praxis, termin, gesundheit, arzt, kur, visite",
    seed: "Medivita",
  },
  {
    title: "📊 SaaS Finanzen & Steuern",
    desc: "Automatisierte Buchhaltung, Beleg-Scanning und Umsatzsteuervoranmeldung für Freelancer und B2B-Agenturen.",
    kws: "finanz, steuer, rechnung, buch, saldo, fiskal",
    seed: "Fiskalo",
  },
  {
    title: "⚡ KI Notizen & Knowledge-Base",
    desc: "Lokale, verschlüsselte Second-Brain App mit KI-Assistent zur automatischen Wissensvernetzung.",
    kws: "notiz, wissen, merke, faden, kopf, archiv",
    seed: "Gedankenknoten",
  },
];

const TLDS_AVAILABLE = ["de", "com", "app", "ai", "io", "dev"];
const STYLE_OPTIONS = [
  { id: "brandable", label: "Fantasiewort / Kunstwort (Stark nach § 8 MarkenG)" },
  { id: "portmanteau", label: "Portmanteau (Wortkreuzung aus 2 Stämmen)" },
  { id: "neolatin", label: "Neo-Latein / Metapher (Offener, seriöser Klang)" },
  { id: "compound", label: "Kompositum (Zwei Wörter kombiniert)" },
  { id: "short", label: "Ultra-Kurz (4 bis 6 Buchstaben)" },
];

export default function MarkenFreiDashboard() {
  // LLM Config State
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(getDefaultConfig());
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaRunning, setOllamaRunning] = useState(false);

  // Form State
  const [description, setDescription] = useState(PRESET_EXAMPLES[0].desc);
  const [keywords, setKeywords] = useState(PRESET_EXAMPLES[0].kws);
  const [brandSeed, setBrandSeed] = useState(PRESET_EXAMPLES[0].seed);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([
    "brandable",
    "portmanteau",
  ]);
  const [selectedTlds, setSelectedTlds] = useState<string[]>([
    "de",
    "com",
    "app",
    "ai",
  ]);
  const [maxLen, setMaxLen] = useState<number>(11);
  const [avoidWords, setAvoidWords] = useState<string>("");

  // Candidate generation & check states
  const [candidatesText, setCandidatesText] = useState<string>(
    "wachwerk\nschichtkompass\nresqdesk\nvelowache\ncuratakt",
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCheckingBatch, setIsCheckingBatch] = useState(false);
  const [checkProgress, setCheckProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);

  // Results State
  const [reports, setReports] = useState<ClearanceReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ClearanceReport | null>(
    null,
  );
  const [filterMode, setFilterMode] = useState<
    "all" | "green" | "de-free" | "com-free" | "high-score"
  >("all");
  const [sortBy, setSortBy] = useState<"score" | "name" | "length">("score");

  // Open-Data live word lab state
  const [openDataField, setOpenDataField] = useState<OpenDataWordField | null>(
    null,
  );
  const [isLoadingOpenData, setIsLoadingOpenData] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Load LLM configuration from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LLM_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.provider) {
          setLlmConfig(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Save LLM configuration
  const saveLlmConfig = (next: LlmConfig) => {
    setLlmConfig(next);
    try {
      localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  // Check Ollama status
  const checkOllama = useCallback(async () => {
    try {
      const res = await fetch("/api/ollama-models");
      if (res.ok) {
        const data = await res.json();
        setOllamaRunning(data.running);
        setOllamaModels(data.models || []);
      }
    } catch {
      setOllamaRunning(false);
    }
  }, []);

  useEffect(() => {
    if (llmConfig.provider === "ollama") {
      checkOllama();
    }
  }, [llmConfig.provider, checkOllama]);

  // Load Open Data words
  const refreshOpenData = useCallback(async () => {
    if (!keywords.trim() && !description.trim()) return;
    setIsLoadingOpenData(true);
    try {
      const res = await fetch("/api/opendata-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords,
          description,
          brandSeed,
          maxLen,
          avoid: avoidWords ? avoidWords.split(",") : [],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setOpenDataField(data);
      }
    } catch (err) {
      console.error("OpenData fetch error:", err);
    } finally {
      setIsLoadingOpenData(false);
    }
  }, [keywords, description, brandSeed, maxLen, avoidWords]);

  // Trigger Open Data when keywords change initially
  useEffect(() => {
    const timer = setTimeout(() => {
      refreshOpenData();
    }, 600);
    return () => clearTimeout(timer);
  }, [keywords, description, refreshOpenData]);

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Add keyword from Open Data chips
  const addKeyword = (word: string) => {
    const clean = word.toLowerCase().trim();
    const current = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (!current.includes(clean)) {
      setKeywords([...current, clean].join(", "));
    }
  };

  // Add candidate to text area
  const addCandidate = (name: string) => {
    const clean = name.toLowerCase().trim();
    const current = candidatesText
      .split("\n")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    if (!current.includes(clean)) {
      setCandidatesText([...current, clean].join("\n"));
    }
  };

  // Toggle style chip
  const toggleStyle = (styleId: string) => {
    if (selectedStyles.includes(styleId)) {
      if (selectedStyles.length > 1) {
        setSelectedStyles(selectedStyles.filter((s) => s !== styleId));
      }
    } else {
      setSelectedStyles([...selectedStyles, styleId]);
    }
  };

  // Toggle TLD chip
  const toggleTld = (tld: string) => {
    if (selectedTlds.includes(tld)) {
      if (selectedTlds.length > 1) {
        setSelectedTlds(selectedTlds.filter((t) => t !== tld));
      }
    } else {
      setSelectedTlds([...selectedTlds, tld]);
    }
  };

  // Generate names via AI / Open-Data
  const handleGenerate = async (forceOpenData = false) => {
    setIsGenerating(true);
    try {
      const activeProvider = forceOpenData ? "opendata" : llmConfig.provider;
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: activeProvider,
          model: llmConfig.model,
          apiKey: llmConfig.apiKey,
          baseUrl: llmConfig.baseUrl,
          brandSeed,
          description,
          keywords,
          tone: "modern, vertrauenswürdig, rechtssicher",
          styles: selectedStyles,
          avoid: avoidWords,
          maxLen,
          count: 14,
          exclude: candidatesText.split("\n"),
        }),
      });

      const data = await res.json();
      if (data.candidates && Array.isArray(data.candidates)) {
        const newNames = data.candidates.map(
          (c: { name: string }) => c.name.toLowerCase().trim(),
        );
        const existing = candidatesText
          .split("\n")
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean);
        const merged = Array.from(new Set([...existing, ...newNames]));
        setCandidatesText(merged.join("\n"));
        if (data.openDataField) {
          setOpenDataField(data.openDataField);
        }
      } else if (data.error) {
        alert(`Generierungs-Fehler: ${data.error}`);
      }
    } catch (err) {
      alert(
        `Fehler: ${err instanceof Error ? err.message : "Verbindungsfehler"}`,
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Run clearance check for a single candidate
  const checkCandidate = async (
    name: string,
    tagline?: string,
  ): Promise<ClearanceReport | null> => {
    try {
      const res = await fetch("/api/clearance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          tagline,
          description,
          keywords: keywords.split(",").map((k) => k.trim()),
          tlds: selectedTlds,
          provider: llmConfig.provider,
          apiKey: llmConfig.apiKey,
        }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error(`Check failed for ${name}:`, e);
    }
    return null;
  };

  // Run batch clearance on all candidates in textarea
  const handleRunBatchClearance = async () => {
    const rawNames = candidatesText
      .split("\n")
      .map((n) => n.trim().toLowerCase().replace(/[^a-z0-9]/g, ""))
      .filter((n) => n.length >= 3);

    const names = Array.from(new Set(rawNames));
    if (names.length === 0) {
      alert("Bitte zuerst mindestens einen Namen eingeben oder generieren.");
      return;
    }

    setIsCheckingBatch(true);
    setReports([]);

    const results: ClearanceReport[] = [];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      setCheckProgress({ current: i + 1, total: names.length, name });
      const report = await checkCandidate(name);
      if (report) {
        results.push(report);
        // Progressive UI updates
        setReports([...results]);
      }
    }

    setCheckProgress(null);
    setIsCheckingBatch(false);
  };

  // Filtered and sorted reports
  const displayReports = useMemo(() => {
    let filtered = [...reports];
    if (filterMode === "green") {
      filtered = filtered.filter((r) => r.matrixScore.verdict === "grün");
    } else if (filterMode === "de-free") {
      filtered = filtered.filter((r) =>
        r.domains.some((d) => d.tld === "de" && d.status === "available"),
      );
    } else if (filterMode === "com-free") {
      filtered = filtered.filter((r) =>
        r.domains.some((d) => d.tld === "com" && d.status === "available"),
      );
    } else if (filterMode === "high-score") {
      filtered = filtered.filter((r) => r.matrixScore.totalScore >= 80);
    }

    filtered.sort((a, b) => {
      if (sortBy === "score") {
        return b.matrixScore.totalScore - a.matrixScore.totalScore;
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "length") {
        return a.name.length - b.name.length;
      }
      return 0;
    });

    return filtered;
  }, [reports, filterMode, sortBy]);

  // Summary counts
  const summaryCounts = useMemo(() => {
    const total = reports.length;
    const green = reports.filter((r) => r.matrixScore.verdict === "grün").length;
    const deFree = reports.filter((r) =>
      r.domains.some((d) => d.tld === "de" && d.status === "available"),
    ).length;
    const appStoreClear = reports.filter(
      (r) => r.appStore.status === "clear",
    ).length;
    return { total, green, deFree, appStoreClear };
  }, [reports]);

  // Export results as Markdown
  const exportAsMarkdown = () => {
    if (reports.length === 0) return;
    let md = `# MarkenFrei Clearance-Bericht\n\nErstellt am: ${new Date().toLocaleString("de-DE")}\nProjekt: ${description}\n\n`;
    md += `| Name | Score | Urteil | .de | .com | .app | .ai | App Store | Markenrecht (§ 9 MarkenG) |\n`;
    md += `|---|---|---|---|---|---|---|---|---|\n`;

    for (const r of reports) {
      const deStatus =
        r.domains.find((d) => d.tld === "de")?.status === "available"
          ? "✅ frei"
          : "❌ belegt";
      const comStatus =
        r.domains.find((d) => d.tld === "com")?.status === "available"
          ? "✅ frei"
          : "❌ belegt";
      const appStatus =
        r.domains.find((d) => d.tld === "app")?.status === "available"
          ? "✅ frei"
          : "❌ belegt";
      const aiStatus =
        r.domains.find((d) => d.tld === "ai")?.status === "available"
          ? "✅ frei"
          : "❌ belegt";
      const appStoreVerdict =
        r.appStore.status === "clear"
          ? "✅ frei"
          : r.appStore.status === "collision"
            ? "🚨 Kollision"
            : "⚠️ ähnlich";
      const tmVerdict =
        r.trademark.protectedCollisions.length === 0
          ? "✅ keine Kollision"
          : `⚠️ ${r.trademark.protectedCollisions[0].note}`;

      md += `| **${r.name}** | ${r.matrixScore.totalScore}/100 | ${r.matrixScore.verdict.toUpperCase()} | ${deStatus} | ${comStatus} | ${appStatus} | ${aiStatus} | ${appStoreVerdict} | ${tmVerdict} |\n`;
    }

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `markenfrei-bericht-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeMeta = getProvider(llmConfig.provider);

  return (
    <div className="flex-1 min-h-screen flex flex-col bg-[#0b0e17] text-slate-100">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-[#0f1422]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  MarkenFrei
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Open-Data & KI
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Rechtssichere Namen für Apps & Webseiten (Markenrecht, Domains & Werktitelschutz)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Provider Trigger Button */}
            <button
              onClick={() => setIsConfigOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition"
              title="KI-Modell & Provider konfigurieren"
            >
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-medium max-w-[140px] truncate">
                {activeMeta?.label.split("(")[0] || "Open-Data"}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </button>

            <a
              href="https://register.dpma.de/DPMAregister/marke/einsteiger"
              target="_blank"
              rel="noreferrer"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950/60 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-700 transition"
            >
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              <span>DPMAregister</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 w-full space-y-8">
        {/* Banner with Presets */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-[#121829] via-[#0f1422] to-[#0d111a] p-5 sm:p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Finde unbelastete Namen für deine nächste App oder Webseite
                </h1>
                <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                  Kombiniert <strong>Open-Data Wortfelder</strong> (OpenThesaurus & Datamuse), <strong>Multi-Provider LLMs</strong> (Gemini, Claude, Ollama), <strong>Kölner Phonetik</strong> (§ 9 MarkenG), <strong>Apple App Store Werktitelschutz</strong> (§ 5 MarkenG) und <strong>Echtzeit-Domainchecks via RDAP/DNS</strong>.
                </p>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-slate-400 mr-1">Beispiele:</span>
                {PRESET_EXAMPLES.map((ex, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setDescription(ex.desc);
                      setKeywords(ex.kws);
                      setBrandSeed(ex.seed);
                    }}
                    className="text-xs px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/50 transition cursor-pointer"
                  >
                    {ex.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 2-Column Grid: Inputs & Open-Data Lab */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Form Briefing */}
          <div className="lg:col-span-7 space-y-5">
            <div className="rounded-2xl border border-slate-800/90 bg-[#111624] p-5 sm:p-6 space-y-5 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs font-bold border border-emerald-500/20">
                    1
                  </div>
                  <h2 className="font-semibold text-white text-base">
                    Projekt-Briefing & Namens-Kriterien
                  </h2>
                </div>
                <span className="text-xs text-slate-400">
                  Basis für KI & Open-Data
                </span>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Projektbeschreibung (Was tut die App / Webseite?)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="z.B. Digitales Wachbuch und Dienstplaner für Rettungswachen und Feuerwehren..."
                  className="w-full rounded-xl bg-slate-900/90 border border-slate-700/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition resize-none"
                />
              </div>

              {/* Keywords & Brand Seed */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Kern-Keywords (kommagetrennt)
                  </label>
                  <input
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="rettung, wache, schicht, einsatz"
                    className="w-full rounded-xl bg-slate-900/90 border border-slate-700/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                    <span>Marken-Seed / Idee (optional)</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      Ausgangswort
                    </span>
                  </label>
                  <input
                    type="text"
                    value={brandSeed}
                    onChange={(e) => setBrandSeed(e.target.value)}
                    placeholder="z.B. WachWerk oder frei lassen"
                    className="w-full rounded-xl bg-slate-900/90 border border-slate-700/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              {/* Naming Styles Chips */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Bevorzugte Namensstile (§ 8 MarkenG Unterscheidungskraft)
                </label>
                <div className="flex flex-wrap gap-2">
                  {STYLE_OPTIONS.map((style) => {
                    const isSelected = selectedStyles.includes(style.id);
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => toggleStyle(style.id)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-medium"
                            : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                        }`}
                      >
                        {isSelected && (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        )}
                        <span>{style.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Domains to check & Max length */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Domain-Endungen (Echtzeit-RDAP/DNS)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {TLDS_AVAILABLE.map((tld) => {
                      const isSelected = selectedTlds.includes(tld);
                      return (
                        <button
                          key={tld}
                          type="button"
                          onClick={() => toggleTld(tld)}
                          className={`text-xs font-mono px-2.5 py-1 rounded-md border transition cursor-pointer ${
                            isSelected
                              ? "bg-teal-500/20 border-teal-500/50 text-teal-300 font-bold"
                              : "bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          .{tld}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Max. Buchstabenlänge
                    </label>
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {maxLen} Zeichen
                    </span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={16}
                    value={maxLen}
                    onChange={(e) => setMaxLen(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>4 (Snappy)</span>
                    <span>10 (Ideal)</span>
                    <span>16 (Deskriptiv)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Open-Data Word Lab */}
          <div className="lg:col-span-5 space-y-5">
            <div className="rounded-2xl border border-slate-800/90 bg-[#111624] p-5 sm:p-6 space-y-4 shadow-lg flex flex-col h-full">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-xs font-bold border border-cyan-500/20">
                    2
                  </div>
                  <h2 className="font-semibold text-white text-base">
                    Open-Data Wort-Labor
                  </h2>
                </div>
                <button
                  onClick={refreshOpenData}
                  disabled={isLoadingOpenData}
                  className="p-1.5 rounded-lg border border-slate-700/70 bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white transition disabled:opacity-50"
                  title="Open Data neu abfragen"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      isLoadingOpenData ? "animate-spin text-cyan-400" : ""
                    }`}
                  />
                </button>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Live-Abfrage ohne API-Key aus <strong>OpenThesaurus.de</strong>{" "}
                (Synonyme) und <strong>Datamuse</strong> (semantische Felder). Klicke auf Begriffe, um sie zu deinen Keywords oder Kandidaten hinzuzufügen!
              </p>

              {/* German Synonyms */}
              <div className="space-y-1.5 flex-1">
                <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                  Deutsche Synonyme & Assoziationen (OpenThesaurus)
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {openDataField?.germanSynonyms &&
                  openDataField.germanSynonyms.length > 0 ? (
                    openDataField.germanSynonyms.map((syn, idx) => (
                      <button
                        key={idx}
                        onClick={() => addKeyword(syn)}
                        className="text-xs px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700/80 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-500/50 transition cursor-pointer"
                        title="Zu Keywords hinzufügen"
                      >
                        + {syn}
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">
                      {isLoadingOpenData
                        ? "Lade Open-Data Synonyme..."
                        : "Begriffe in Keywords eingeben..."}
                    </span>
                  )}
                </div>
              </div>

              {/* Open-Data Morpheme Synthesizer Suggestions */}
              <div className="space-y-1.5 border-t border-slate-800/80 pt-3">
                <span className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    Morphem-Synthese (Sofort-Kunstwörter)
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    100% Kostenlos
                  </span>
                </span>

                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {openDataField?.synthesizedCandidates &&
                  openDataField.synthesizedCandidates.length > 0 ? (
                    openDataField.synthesizedCandidates.slice(0, 10).map((c, idx) => (
                      <button
                        key={idx}
                        onClick={() => addCandidate(c.name)}
                        className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/60 transition cursor-pointer flex items-center gap-1"
                        title={`${c.origin} · Zu Prüfliste hinzufügen`}
                      >
                        <Plus className="w-3 h-3 text-emerald-400" />
                        <span className="font-medium">{c.name}</span>
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">
                      {isLoadingOpenData
                        ? "Synthetisiere Silben..."
                        : "Warte auf Keyword-Eingaben..."}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Candidate Box & Actions */}
        <div className="rounded-2xl border border-slate-800/90 bg-[#111624] p-5 sm:p-6 space-y-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs font-bold border border-emerald-500/20">
                3
              </div>
              <h2 className="font-semibold text-white text-base">
                Kandidaten-Liste (zu prüfende Namen)
              </h2>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {/* AI Generate Button */}
              <button
                onClick={() => handleGenerate(false)}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md shadow-emerald-600/20 transition disabled:opacity-50 cursor-pointer"
              >
                <Sparkles
                  className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`}
                />
                <span>
                  {isGenerating
                    ? "Generiere..."
                    : `Mit KI generieren (${activeMeta?.label.split("(")[0]})`}
                </span>
              </button>

              {/* Open Data Generator Button */}
              <button
                onClick={() => handleGenerate(true)}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs transition disabled:opacity-50 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Open-Data Morpheme</span>
              </button>

              {/* Clear button */}
              <button
                onClick={() => setCandidatesText("")}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                title="Liste leeren"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <textarea
              value={candidatesText}
              onChange={(e) => setCandidatesText(e.target.value)}
              rows={4}
              placeholder="Ein Name pro Zeile (z.B. velora, wachwerk, schichtpilot)..."
              className="w-full rounded-xl bg-slate-950/80 border border-slate-700/80 p-3 text-sm font-mono text-emerald-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition resize-y"
            />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
              <span>
                {
                  candidatesText
                    .split("\n")
                    .map((c) => c.trim())
                    .filter(Boolean).length
                }{" "}
                Namen in der Warteschlange. Du kannst jederzeit eigene Namen
                eintragen oder entfernen.
              </span>

              {/* Main Clearance Trigger */}
              <button
                onClick={handleRunBatchClearance}
                disabled={isCheckingBatch || !candidatesText.trim()}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/25 transition disabled:opacity-50 cursor-pointer"
              >
                <Play
                  className={`w-4 h-4 ${isCheckingBatch ? "animate-spin" : ""}`}
                />
                <span>
                  {isCheckingBatch
                    ? "Live-Clearance läuft..."
                    : "Alle Namen prüfen (Marken-, Domain- & App-Check)"}
                </span>
              </button>
            </div>
          </div>

          {/* Progress Indicator */}
          {checkProgress && (
            <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs text-emerald-300">
                <span className="flex items-center gap-1.5 font-medium">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  Prüfe ({checkProgress.current}/{checkProgress.total}):{" "}
                  <strong className="text-white font-mono">
                    "{checkProgress.name}"
                  </strong>{" "}
                  (RDAP, App Store, DPMA Kölner Phonetik, Wikidata, npm)...
                </span>
                <span className="font-mono">
                  {Math.round((checkProgress.current / checkProgress.total) * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-400 h-full transition-all duration-300"
                  style={{
                    width: `${(checkProgress.current / checkProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Results Section */}
        {reports.length > 0 && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="rounded-xl border border-slate-800 bg-[#111624] p-4 space-y-1">
                <span className="text-xs text-slate-400">Geprüfte Namen</span>
                <p className="text-2xl font-bold font-mono text-white">
                  {summaryCounts.total}
                </p>
                <span className="text-[11px] text-slate-500">
                  Vollständige Prüfung
                </span>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-1">
                <span className="text-xs text-emerald-300 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Grünes Licht
                </span>
                <p className="text-2xl font-bold font-mono text-emerald-400">
                  {summaryCounts.green}
                </p>
                <span className="text-[11px] text-emerald-500">
                  Hohe Freigabechance
                </span>
              </div>

              <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-4 space-y-1">
                <span className="text-xs text-teal-300 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-teal-400" />
                  .de verfügbar
                </span>
                <p className="text-2xl font-bold font-mono text-teal-300">
                  {summaryCounts.deFree}
                </p>
                <span className="text-[11px] text-teal-500">
                  Sofort registrierbar
                </span>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#111624] p-4 space-y-1">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                  App Store frei
                </span>
                <p className="text-2xl font-bold font-mono text-cyan-400">
                  {summaryCounts.appStoreClear}
                </p>
                <span className="text-[11px] text-slate-500">
                  Kein Werktitel-Konflikt
                </span>
              </div>
            </div>

            {/* Filter & Action Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0f1422] p-3">
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-slate-400 mr-2 flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5" />
                  Filter:
                </span>
                <button
                  onClick={() => setFilterMode("all")}
                  className={`text-xs px-2.5 py-1 rounded-md border transition cursor-pointer ${
                    filterMode === "all"
                      ? "bg-slate-700 text-white border-slate-600"
                      : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200"
                  }`}
                >
                  Alle ({reports.length})
                </button>
                <button
                  onClick={() => setFilterMode("green")}
                  className={`text-xs px-2.5 py-1 rounded-md border transition cursor-pointer ${
                    filterMode === "green"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200"
                  }`}
                >
                  🟢 Nur Grünes Licht ({summaryCounts.green})
                </button>
                <button
                  onClick={() => setFilterMode("de-free")}
                  className={`text-xs px-2.5 py-1 rounded-md border transition cursor-pointer ${
                    filterMode === "de-free"
                      ? "bg-teal-500/20 text-teal-300 border-teal-500/40"
                      : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200"
                  }`}
                >
                  🌐 .de frei ({summaryCounts.deFree})
                </button>
                <button
                  onClick={() => setFilterMode("high-score")}
                  className={`text-xs px-2.5 py-1 rounded-md border transition cursor-pointer ${
                    filterMode === "high-score"
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                      : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200"
                  }`}
                >
                  ⭐ Score 80+
                </button>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="text-xs rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1 text-slate-300 focus:outline-none"
                >
                  <option value="score">Sortieren: Höchster Score</option>
                  <option value="name">Sortieren: Name (A-Z)</option>
                  <option value="length">Sortieren: Kürzeste zuerst</option>
                </select>

                <button
                  onClick={exportAsMarkdown}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition"
                  title="Als Markdown-Bericht herunterladen"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>
              </div>
            </div>

            {/* Results Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayReports.map((r) => {
                const isGreen = r.matrixScore.verdict === "grün";
                const isRed = r.matrixScore.verdict === "rot";

                return (
                  <div
                    key={r.name}
                    className={`rounded-2xl border p-5 transition relative overflow-hidden flex flex-col justify-between ${
                      isGreen
                        ? "border-emerald-500/40 bg-gradient-to-br from-[#0e1b1d] via-[#101924] to-[#0c121b] hover:border-emerald-500/70"
                        : isRed
                          ? "border-rose-900/50 bg-gradient-to-br from-[#1a0e14] via-[#13111b] to-[#0c121b] hover:border-rose-800"
                          : "border-slate-800 bg-gradient-to-br from-[#131826] via-[#101420] to-[#0c1018] hover:border-slate-700"
                    }`}
                  >
                    <div className="space-y-4">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold font-mono tracking-tight text-white capitalize">
                              {r.name}
                            </h3>
                            <span
                              className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                                isGreen
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                  : isRed
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                    : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              }`}
                            >
                              {r.matrixScore.verdictLabel}
                            </span>
                          </div>
                          {r.tagline && (
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                              {r.tagline}
                            </p>
                          )}
                        </div>

                        {/* Score Badge */}
                        <div className="text-right">
                          <div
                            className={`text-2xl font-black font-mono leading-none ${
                              isGreen
                                ? "text-emerald-400"
                                : isRed
                                  ? "text-rose-400"
                                  : "text-amber-400"
                            }`}
                          >
                            {r.matrixScore.totalScore}
                            <span className="text-xs font-normal text-slate-500">
                              /100
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            Clearance-Score
                          </span>
                        </div>
                      </div>

                      {/* Domain Badges */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          Domain-Verfügbarkeit (Live RDAP / DNS)
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {r.domains.map((dom) => {
                            const isAvail = dom.status === "available";
                            const isTaken = dom.status === "taken";
                            return (
                              <a
                                key={dom.tld}
                                href={dom.registrarLinks.inwx}
                                target="_blank"
                                rel="noreferrer"
                                className={`text-xs font-mono px-2 py-1 rounded-md border flex items-center gap-1 transition ${
                                  isAvail
                                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                                    : isTaken
                                      ? "bg-slate-900/60 border-slate-800 text-slate-500 line-through opacity-70"
                                      : "bg-slate-900 border-slate-700 text-slate-400"
                                }`}
                                title={
                                  isAvail
                                    ? `${dom.domain} ist FREI! Klicke zum Registrieren`
                                    : `${dom.domain} ist belegt`
                                }
                              >
                                {isAvail ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                ) : isTaken ? (
                                  <XCircle className="w-3 h-3 text-slate-600" />
                                ) : (
                                  <HelpCircle className="w-3 h-3 text-slate-500" />
                                )}
                                <span>.{dom.tld}</span>
                              </a>
                            );
                          })}
                        </div>
                      </div>

                      {/* Legal & App Store Signals Grid */}
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/80">
                        {/* Apple App Store */}
                        <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/70 space-y-1">
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Smartphone className="w-3 h-3 text-cyan-400" />
                            Apple App Store (DE)
                          </span>
                          <div className="font-medium">
                            {r.appStore.status === "clear" ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Keine App gefunden
                              </span>
                            ) : r.appStore.status === "collision" ? (
                              <span className="text-rose-400 flex items-center gap-1 font-semibold">
                                <AlertTriangle className="w-3 h-3" />
                                Gleicher App-Name!
                              </span>
                            ) : (
                              <span className="text-amber-400 flex items-center gap-1">
                                <HelpCircle className="w-3 h-3" />
                                Ähnliche Apps ({r.appStore.hits.length})
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Phonetics & Soundex */}
                        <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/70 space-y-1">
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Volume2 className="w-3 h-3 text-amber-400" />
                            Kölner Phonetik Code
                          </span>
                          <div className="font-mono text-slate-200 flex items-center justify-between">
                            <span>{r.trademark.koelnerPhonetik}</span>
                            <span className="text-[10px] text-slate-500 font-sans">
                              Soundex: {r.trademark.soundex}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Collision alerts if any */}
                      {r.trademark.protectedCollisions.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30 text-xs text-rose-300 space-y-1">
                          <span className="font-semibold flex items-center gap-1 text-rose-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Mögliche Markenkollision (§ 9 MarkenG):
                          </span>
                          <p className="text-[11px] leading-snug">
                            {r.trademark.protectedCollisions[0].note}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Card Footer Button */}
                    <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between">
                      <div className="text-[11px] text-slate-500">
                        Nizza-Klassen: {r.trademark.niceClasses.map((c) => c.classNumber).join(", ")}
                      </div>

                      <button
                        onClick={() => setSelectedReport(r)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
                      >
                        <span>Audit & DPMA-Abfrage</span>
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Detail-Audit Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#101524] border border-slate-700 rounded-2xl max-w-3xl w-full p-6 space-y-6 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold font-mono tracking-tight text-white capitalize">
                    {selectedReport.name}
                  </h2>
                  <span
                    className={`text-xs uppercase font-bold px-2.5 py-1 rounded-full border ${
                      selectedReport.matrixScore.verdict === "grün"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : selectedReport.matrixScore.verdict === "rot"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    }`}
                  >
                    {selectedReport.matrixScore.verdictLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Umfassendes rechtliches & technisches Clearance-Gutachten
                </p>
              </div>

              <button
                onClick={() => setSelectedReport(null)}
                className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Score Matrix & Radar Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Matrix Score Card */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2 text-center flex flex-col justify-center items-center">
                <span className="text-xs text-slate-400">Gesamt-Score</span>
                <div className="text-4xl font-black font-mono text-emerald-400">
                  {selectedReport.matrixScore.totalScore}
                  <span className="text-sm font-normal text-slate-500">
                    /100
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  Gewichteter 10-Kriterien Algorithmus
                </span>
              </div>

              {/* Dodomains Brandability Breakdown */}
              <div className="md:col-span-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300 font-semibold border-b border-slate-800 pb-1.5">
                  <span>Brandability Faktoren (r13i/dodomains)</span>
                  <span className="font-mono text-emerald-400">
                    {selectedReport.dodoBrandability.score} / 100
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">
                      Länge (max 25)
                    </span>
                    <strong className="text-slate-200">
                      {selectedReport.dodoBrandability.breakdown.length}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">
                      Aussprache (max 25)
                    </span>
                    <strong className="text-slate-200">
                      {selectedReport.dodoBrandability.breakdown.pronounceability}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">
                      Bindestriche (max 15)
                    </span>
                    <strong className="text-slate-200">
                      {selectedReport.dodoBrandability.breakdown.hyphens}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">
                      Ziffern (max 15)
                    </span>
                    <strong className="text-slate-200">
                      {selectedReport.dodoBrandability.breakdown.digits}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">
                      TLD-Tier (max 15)
                    </span>
                    <strong className="text-slate-200">
                      {selectedReport.dodoBrandability.breakdown.tldTier}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">
                      Typo-Risiko (max 5)
                    </span>
                    <strong className="text-slate-200">
                      {selectedReport.dodoBrandability.breakdown.typoRisk}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Official Register Deep Links & DPMA Search Query */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Scale className="w-4 h-4" />
                  Offizielle Markenregister (1-Klick Recherche)
                </span>
                <span className="text-[11px] text-slate-400">
                  Direkte Abfrage-Links
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  href={selectedReport.trademark.registryLinks.dpma}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-xs font-medium transition"
                >
                  <span>DPMAregister (DE)</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={selectedReport.trademark.registryLinks.euipo}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 hover:bg-blue-500/20 text-xs font-medium transition"
                >
                  <span>TMview (EU & International)</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={selectedReport.trademark.registryLinks.wipo}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 text-xs font-medium transition"
                >
                  <span>WIPO Global Brand DB</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={selectedReport.trademark.registryLinks.offeneRegister}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 text-xs font-medium transition"
                >
                  <span>OffeneRegister.de (Handelsregister)</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* DPMA Expert Query */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Experten-Suchstring für DPMAregister:</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        selectedReport.trademark.dpmaExpertQuery,
                        "dpma",
                      )
                    }
                    className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedText === "dpma" ? "Kopiert!" : "Kopieren"}</span>
                  </button>
                </div>
                <pre className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto select-all">
                  {selectedReport.trademark.dpmaExpertQuery}
                </pre>
              </div>
            </div>

            {/* Nice Classification (Nizza-Klassen) */}
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Empfohlene Nizza-Waren- & Dienstleistungsklassen
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {selectedReport.trademark.niceClasses.map((cls) => (
                  <div
                    key={cls.classNumber}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1"
                  >
                    <div className="font-semibold text-slate-200">
                      {cls.title}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {cls.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Phonetic Twins & Kölner Phonetik */}
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Phonetische Zwillinge & Klangähnlichkeit (§ 9 MarkenG)
              </span>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Im Markenrecht gilt: <strong>Klanggleiche Namen verletzen bestehende Marken</strong>, auch wenn sie anders geschrieben werden (z. B. <em>Clarna</em> vs. <em>Klarna</em>). Kölner Phonetik Code für diesen Namen: <strong className="text-emerald-400 font-mono">{selectedReport.trademark.koelnerPhonetik}</strong>.
                </p>
                {selectedReport.trademark.phoneticTwins.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center pt-1">
                    <span className="text-[11px] text-slate-400 mr-1">
                      Klanggleiche Varianten zur Gegenprüfung:
                    </span>
                    {selectedReport.trademark.phoneticTwins.map((twin, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-xs border border-slate-700"
                      >
                        {twin}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Apple App Store & Wikidata Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* App Store Details */}
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  App Store Treffer (Werktitelschutz § 5 Abs. 3)
                </span>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs min-h-[100px]">
                  {selectedReport.appStore.hits.length > 0 ? (
                    selectedReport.appStore.hits.map((app, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between border-b border-slate-800 pb-1.5 last:border-0"
                      >
                        <div>
                          <div className="font-medium text-slate-200">
                            {app.trackName}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {app.sellerName} · {app.primaryGenreName}
                          </div>
                        </div>
                        {app.trackViewUrl && (
                          <a
                            href={app.trackViewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))
                  ) : (
                    <span className="text-emerald-400 flex items-center gap-1.5 pt-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Keine gleichnamigen Apps im DE App Store gefunden.
                    </span>
                  )}
                </div>
              </div>

              {/* Wikidata / Open Data Entities */}
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <Globe className="w-4 h-4" />
                  Wikidata Strukturierte Entitäten
                </span>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs min-h-[100px]">
                  {selectedReport.wikidataHits.length > 0 ? (
                    selectedReport.wikidataHits.slice(0, 3).map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between border-b border-slate-800 pb-1.5 last:border-0"
                      >
                        <div>
                          <div className="font-medium text-slate-200">
                            {w.label}
                          </div>
                          <div className="text-[10px] text-slate-400 line-clamp-1">
                            {w.description}
                          </div>
                        </div>
                        <a
                          href={w.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))
                  ) : (
                    <span className="text-emerald-400 flex items-center gap-1.5 pt-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Keine bestehenden Firmen/Marken in Wikidata erfasst.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Dev Ecosystem (GitHub / npm / PyPI) */}
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Tech- & Entwickler-Ökosystem (Pakete & Repos)
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    GitHub Handle
                  </span>
                  <div className="font-semibold capitalize">
                    {selectedReport.devAndSocial.githubHandle === "available" ? (
                      <span className="text-emerald-400">Frei</span>
                    ) : selectedReport.devAndSocial.githubHandle === "taken" ? (
                      <span className="text-rose-400">Belegt</span>
                    ) : (
                      <span className="text-slate-500">Unbekannt</span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Package className="w-3 h-3" />
                    npm Package
                  </span>
                  <div className="font-semibold capitalize">
                    {selectedReport.devAndSocial.npmPackage === "available" ? (
                      <span className="text-emerald-400">Frei</span>
                    ) : selectedReport.devAndSocial.npmPackage === "taken" ? (
                      <span className="text-rose-400">Belegt</span>
                    ) : (
                      <span className="text-slate-500">Unbekannt</span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Terminal className="w-3 h-3" />
                    PyPI Package
                  </span>
                  <div className="font-semibold capitalize">
                    {selectedReport.devAndSocial.pypiPackage === "available" ? (
                      <span className="text-emerald-400">Frei</span>
                    ) : selectedReport.devAndSocial.pypiPackage === "taken" ? (
                      <span className="text-rose-400">Belegt</span>
                    ) : (
                      <span className="text-slate-500">Unbekannt</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-4">
              <button
                onClick={() => {
                  const text = `MarkenFrei Audit für "${selectedReport.name}":\nScore: ${selectedReport.matrixScore.totalScore}/100 (${selectedReport.matrixScore.verdictLabel})\nKölner Phonetik: ${selectedReport.trademark.koelnerPhonetik}\nDPMA Suchanfrage: ${selectedReport.trademark.dpmaExpertQuery}`;
                  copyToClipboard(text, "audit");
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>
                  {copiedText === "audit"
                    ? "Zusammenfassung kopiert!"
                    : "Audit kopieren"}
                </span>
              </button>

              <button
                onClick={() => setSelectedReport(null)}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provider & LLM Settings Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#101524] border border-slate-700 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-emerald-400" />
                  KI- & Open-Data Modell konfigurieren
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Wähle zwischen kostenloser Open-Data Engine, Google Gemini, lokalem Ollama oder eigenem API-Key.
                </p>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Provider Grid */}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Provider auswählen
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {PROVIDERS.map((p) => {
                  const isSelected = llmConfig.provider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        const next: LlmConfig = {
                          provider: p.id,
                          model: p.models[0]?.id || "",
                          apiKey: llmConfig.apiKey,
                          baseUrl: p.defaultBaseUrl || "",
                        };
                        saveLlmConfig(next);
                      }}
                      className={`text-left p-2.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? "bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm shadow-emerald-500/10"
                          : "bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs">{p.label}</span>
                        {p.free && (
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                            Free
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                        {p.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* If Provider needs API Key */}
            {activeMeta?.needsKey && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    API-Key für {activeMeta.label}
                  </label>
                  {activeMeta.keyHost && (
                    <a
                      href={`https://${activeMeta.keyHost}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      Key holen ({activeMeta.keyHost})
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <input
                  type="password"
                  value={llmConfig.apiKey}
                  onChange={(e) =>
                    saveLlmConfig({ ...llmConfig, apiKey: e.target.value })
                  }
                  placeholder={`z.B. ${activeMeta.keyPrefix}...`}
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-500">
                  Der Key wird nur lokal in deinem Browser (localStorage) gespeichert und niemals weitergegeben.
                </p>
              </div>
            )}

            {/* Model Selector */}
            {activeMeta && activeMeta.models.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Modell
                </label>
                <select
                  value={llmConfig.model}
                  onChange={(e) =>
                    saveLlmConfig({ ...llmConfig, model: e.target.value })
                  }
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  {activeMeta.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Ollama Local Details */}
            {llmConfig.provider === "ollama" && (
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">
                    Ollama Status (localhost:11434):
                  </span>
                  <span
                    className={`font-mono px-2 py-0.5 rounded text-[10px] ${
                      ollamaRunning
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    {ollamaRunning ? "Aktiv & Erreichbar" : "Nicht gestartet"}
                  </span>
                </div>
                {ollamaModels.length > 0 ? (
                  <div className="text-[11px] text-slate-400">
                    Installierte Modelle: {ollamaModels.join(", ")}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Starte `ollama run llama3.2` oder ein beliebiges Modell im Terminal.
                  </p>
                )}
              </div>
            )}

            {/* Base URL (if custom) */}
            {activeMeta?.needsBaseUrl && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Base URL
                </label>
                <input
                  type="text"
                  value={llmConfig.baseUrl || ""}
                  onChange={(e) =>
                    saveLlmConfig({ ...llmConfig, baseUrl: e.target.value })
                  }
                  placeholder="http://localhost:11434/v1"
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsConfigOpen(false)}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
              >
                Übernehmen & Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
