"use client";

import { useEffect, useState } from "react";
import {
  ArrowSquareOut,
  Check,
  CheckCircle,
  Copy,
  Cpu,
  Globe,
  Lightning,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import { OPEN_APIS, type OpenApiEntry } from "@/lib/open-apis";

type TabId = "mcp" | "apis" | "free";

export function InfoModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>("mcp");
  const [selectedRegion, setSelectedRegion] = useState<string>("Alle");
  const [selectedCategory, setSelectedCategory] = useState<string>("Alle");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore
    }
  };

  const regions: { id: string; label: string }[] = [
    { id: "Alle", label: "Alle Regionen" },
    { id: "Europa", label: "🇪🇺 Europa" },
    { id: "Amerika", label: "🇺🇸 Amerika" },
    { id: "Asien", label: "🌏 Asien" },
    { id: "Global", label: "🌐 Global" },
  ];

  const categories = ["Alle", ...Array.from(new Set(OPEN_APIS.map((a) => a.category)))];

  const filteredApis = OPEN_APIS.filter((a) => {
    const matchRegion = selectedRegion === "Alle" || a.region === selectedRegion;
    const matchCategory = selectedCategory === "Alle" || a.category === selectedCategory;
    return matchRegion && matchCategory;
  });

  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        markenfrei: {
          command: "npx",
          args: ["-y", "markenfrei-mcp"],
        },
      },
    },
    null,
    2,
  );

  const cursorConfig = JSON.stringify(
    {
      mcpServers: {
        markenfrei: {
          command: "npx",
          args: ["-y", "markenfrei-mcp"],
        },
      },
    },
    null,
    2,
  );

  const httpConfig = JSON.stringify(
    {
      mcpServers: {
        markenfrei: {
          url: "https://markenfrei.app/api/mcp",
          type: "http",
        },
      },
    },
    null,
    2,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Markenfrei Infos, Open APIs & MCP Server"
        onClick={(e) => e.stopPropagation()}
        className="fade-up flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-surface shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-wash border border-line">
              <Cpu size={18} weight="bold" className="text-ink" />
            </div>
            <div>
              <h2 className="text-base font-medium text-ink">Markenfrei Infos & MCP-Server</h2>
              <p className="text-xs text-muted">
                Zero-Key Open Data · Globale APIs (Europa, Amerika, Asien) · MCP für KI-Agenten
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="cursor-pointer rounded-md p-1.5 text-muted transition-colors hover:bg-wash hover:text-ink"
          >
            <X size={18} weight="bold" />
          </button>
        </header>

        {/* Tab Navigation */}
        <div className="flex border-b border-line bg-wash/30 px-6 pt-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("mcp")}
            className={`cursor-pointer border-b-2 px-3 py-2 font-medium transition-colors ${
              activeTab === "mcp"
                ? "border-ink text-ink font-semibold"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            🤖 MCP-Server (KI-Agenten)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("apis")}
            className={`cursor-pointer border-b-2 px-3 py-2 font-medium transition-colors ${
              activeTab === "apis"
                ? "border-ink text-ink font-semibold"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            🌐 Globale Open APIs ({OPEN_APIS.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("free")}
            className={`cursor-pointer border-b-2 px-3 py-2 font-medium transition-colors ${
              activeTab === "free"
                ? "border-ink text-ink font-semibold"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            🛡️ 100% Kostenlos & Datenschutz
          </button>
        </div>

        {/* Tab Content: MCP */}
        {activeTab === "mcp" && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-xs">
            <div className="rounded-xl border border-line bg-wash/40 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Lightning size={16} weight="bold" className="text-warn" />
                <h3 className="font-medium text-ink text-sm">Model Context Protocol (MCP) für Agenten</h3>
              </div>
              <p className="text-soft leading-relaxed">
                Integriere Markenfrei direkt in deinen individuellen KI-Agenten (Claude Desktop, Claude Code, Cursor, Codex, Gemini CLI / Antigravity, Windsurf). Dein Agent kann selbstständig Markennamen prüfen, Domains vergleichen und Ideen generieren.
              </p>
            </div>

            {/* Quick config */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">1. Claude Desktop / Claude Code (`claude_desktop_config.json`)</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(claudeConfig, "claude")}
                  className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-soft hover:text-ink"
                >
                  {copiedKey === "claude" ? <Check size={12} weight="bold" className="text-ok" /> : <Copy size={12} />}
                  <span>{copiedKey === "claude" ? "Kopiert!" : "Kopieren"}</span>
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-line bg-wash/60 p-3 font-mono text-[11px] text-ink">
                {claudeConfig}
              </pre>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">2. Cursor (`.cursor/mcp.json`)</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(cursorConfig, "cursor")}
                  className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-soft hover:text-ink"
                >
                  {copiedKey === "cursor" ? <Check size={12} weight="bold" className="text-ok" /> : <Copy size={12} />}
                  <span>{copiedKey === "cursor" ? "Kopiert!" : "Kopieren"}</span>
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-line bg-wash/60 p-3 font-mono text-[11px] text-ink">
                {cursorConfig}
              </pre>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">3. Remote Agenten via HTTP (`POST /api/mcp`)</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(httpConfig, "http")}
                  className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-soft hover:text-ink"
                >
                  {copiedKey === "http" ? <Check size={12} weight="bold" className="text-ok" /> : <Copy size={12} />}
                  <span>{copiedKey === "http" ? "Kopiert!" : "Kopieren"}</span>
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-line bg-wash/60 p-3 font-mono text-[11px] text-ink">
                {httpConfig}
              </pre>
            </div>

            {/* Exposed tools */}
            <div className="space-y-2 pt-2">
              <h4 className="font-medium text-ink text-sm">Verfügbare MCP-Tools:</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-line p-2.5 bg-surface">
                  <span className="font-mono font-medium text-ink">markenfrei_clearance_check</span>
                  <p className="mt-1 text-muted text-[11px]">Komplette Vorab-Prüfung auf Marken, Domains, Phonetik, App Stores & GitHub/npm.</p>
                </div>
                <div className="rounded-lg border border-line p-2.5 bg-surface">
                  <span className="font-mono font-medium text-ink">markenfrei_domain_pricing</span>
                  <p className="mt-1 text-muted text-[11px]">Vergleicht Netcup, Hetzner, OVHcloud, Cloudflare Wholesale & warnt vor Lockvogelangeboten.</p>
                </div>
                <div className="rounded-lg border border-line p-2.5 bg-surface">
                  <span className="font-mono font-medium text-ink">markenfrei_generate_ideas</span>
                  <p className="mt-1 text-muted text-[11px]">Generiert Kunstwörter & Portmanteaus aus Open-Data Wortfeldern (OpenThesaurus & Datamuse).</p>
                </div>
                <div className="rounded-lg border border-line p-2.5 bg-surface">
                  <span className="font-mono font-medium text-ink">markenfrei_inspect_bundle</span>
                  <p className="mt-1 text-muted text-[11px]">Prüft Reverse-DNS App-Bundle-IDs (`de.app.name`) auf iOS App Store & Android Play Store.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Open APIs */}
        {activeTab === "apis" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Region Filter Bar */}
            <div className="border-b border-line px-6 py-2 bg-wash/40 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-medium text-muted mr-1 flex items-center gap-1">
                <Globe size={13} weight="bold" /> Region:
              </span>
              {regions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRegion(r.id)}
                  className={`cursor-pointer rounded-md px-2.5 py-1 transition-colors text-[11px] ${
                    selectedRegion === r.id
                      ? "bg-ink text-white font-medium"
                      : "bg-surface border border-line text-soft hover:bg-wash"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Category Filter */}
            <div className="border-b border-line px-6 py-2 bg-wash/20 flex flex-wrap gap-1.5 text-xs">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedCategory(c)}
                  className={`cursor-pointer rounded-md px-2 py-0.5 transition-colors text-[10px] ${
                    selectedCategory === c
                      ? "bg-soft text-white font-medium"
                      : "bg-surface border border-line text-muted hover:bg-wash hover:text-ink"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              <div className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-surface">
                {filteredApis.map((api: OpenApiEntry) => (
                  <div key={api.id} className="p-3.5 space-y-1 hover:bg-wash/30 transition-colors text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-wash px-1.5 py-0.5 text-[10px] font-medium text-ink border border-line">
                          {api.region === "Europa" ? "🇪🇺 Europa" : api.region === "Amerika" ? "🇺🇸 Amerika" : api.region === "Asien" ? "🌏 Asien" : "🌐 Global"}
                        </span>
                        <span className="font-semibold text-ink">{api.name}</span>
                        <span className="rounded bg-wash px-1.5 py-0.5 text-[10px] font-mono text-muted border border-line">
                          {api.protocol}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] text-ok font-medium shrink-0">
                        <CheckCircle size={12} weight="fill" />
                        {api.auth}
                      </span>
                    </div>

                    <p className="text-soft leading-relaxed">{api.purpose}</p>

                    <div className="flex items-center justify-between text-[11px] pt-1 text-muted">
                      <span className="font-mono truncate max-w-[340px] text-muted/80">{api.endpoint}</span>
                      <a
                        href={api.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-soft hover:text-ink hover:underline shrink-0"
                      >
                        Dokumentation
                        <ArrowSquareOut size={12} weight="bold" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: 100% Kostenlos & Datenschutz */}
        {activeTab === "free" && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-xs">
            <div className="rounded-xl border border-ok/20 bg-ok-bg/30 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} weight="bold" className="text-ok" />
                <h3 className="font-medium text-ink text-sm">Kostenlos · Ohne KI · Regelbasiert</h3>
              </div>
              <p className="text-soft leading-relaxed">
                Markenfrei ist für jeden kostenlos und sofort nutzbar. Die Kernprüfung erfolgt rein algorithmisch über freie Open-Data Protokolle (RDAP, DNS-over-HTTPS, offizielle Register und Store APIs). Es kommt kein Sprachmodell zum Einsatz: Namensideen und Urteil entstehen aus festen Regeln (Kölner Phonetik, Morphem-Bausteine, Scoring). Bei gleichen Antworten der Quellen ergibt sich dasselbe Ergebnis. Niemand benötigt ein Abonnement, ein Benutzerkonto oder API-Keys.
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
              <h4 className="font-medium text-ink text-sm">Privatsphäre & Zero-Tracking</h4>
              <ul className="space-y-2 text-soft list-disc pl-4 leading-relaxed">
                <li><strong>Keine Suchabfragen gespeichert:</strong> Markenfrei speichert eingegebene Namen nicht in einer Datenbank und verkauft sie nicht weiter.</li>
                <li><strong>Weitergabe an Dritte:</strong> Für die Prüfung wird der Name an die jeweiligen Dienste gesendet, darunter DENIC und andere Registries, Google und Cloudflare DNS, Wikipedia, Wikidata, DuckDuckGo, Apple, Google Play, GitHub, npm und PyPI. Diese Dienste sehen deine Anfrage nach ihren eigenen Regeln.</li>
                <li><strong>Open Source (MIT):</strong> Der gesamte Quellcode ist öffentlich auf GitHub einsehbar und auditierbar.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
              <h4 className="font-medium text-ink text-sm">Offizielle Amtsgebühren bei einer Markenanmeldung:</h4>
              <div className="space-y-2 text-soft">
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span><strong>DPMA (Deutschland):</strong> Elektronisch, bis zu 3 Nizza-Klassen inklusive</span>
                  <span className="font-mono text-ink font-medium">290 €</span>
                </div>
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span><strong>EUIPO (Europäische Union):</strong> EU-weiter Schutz (1. Klasse)</span>
                  <span className="font-mono text-ink font-medium">850 €</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span><strong>USPTO (USA):</strong> Pro Waren-/Dienstleistungsklasse (TEAS)</span>
                  <span className="font-mono text-ink font-medium">250 $ - 350 $</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="border-t border-line px-6 py-3.5 flex items-center justify-between text-xs text-muted bg-wash/30">
          <span>Markenfrei · Open Source (MIT)</span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg bg-ink px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-soft"
          >
            Schließen
          </button>
        </footer>
      </div>
    </div>
  );
}
