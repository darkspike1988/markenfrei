"use client";

import { useEffect, useState } from "react";
import { ArrowSquareOut, CheckCircle, Database, ShieldCheck, X } from "@phosphor-icons/react";
import { OPEN_APIS, type OpenApiEntry } from "@/lib/open-apis";

export function InfoModal({ onClose }: { onClose: () => void }) {
  const [selectedCategory, setSelectedCategory] = useState<string>("Alle");

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

  const categories = ["Alle", ...Array.from(new Set(OPEN_APIS.map((a) => a.category)))];

  const filtered =
    selectedCategory === "Alle"
      ? OPEN_APIS
      : OPEN_APIS.filter((a) => a.category === selectedCategory);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Verwendete Open APIs & Datenquellen"
        onClick={(e) => e.stopPropagation()}
        className="fade-up flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-surface shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <Database size={20} weight="bold" className="text-ink" />
            <div>
              <h2 className="text-base font-medium text-ink">Verwendete Open APIs & Quellen</h2>
              <p className="text-xs text-muted">
                {OPEN_APIS.length} offizielle Schnittstellen · 100% Zero-Key Autonomie & Transparenz
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

        {/* Category Pills */}
        <div className="border-b border-line px-6 py-2.5 bg-wash/30 flex flex-wrap gap-1.5 text-xs">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setSelectedCategory(c)}
              className={`cursor-pointer rounded-md px-2.5 py-1 transition-colors ${
                selectedCategory === c
                  ? "bg-ink text-white font-medium"
                  : "bg-surface border border-line text-soft hover:bg-wash"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="rounded-lg border border-ok/20 bg-ok-bg/30 p-3 text-xs text-soft flex items-start gap-2.5">
            <ShieldCheck size={18} weight="bold" className="text-ok shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-ink">Zero-Key & Open Data Prinzip</p>
              <p className="mt-0.5 text-muted">
                Alle Prüfungen greifen auf öffentliche, freie Protokolle (RDAP, DoH, REST) zurück.
                Keine Daten werden monetarisiert, getrackt oder für Dritte gespeichert.
              </p>
            </div>
          </div>

          <div className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-surface">
            {filtered.map((api: OpenApiEntry) => (
              <div key={api.id} className="p-3.5 space-y-1 hover:bg-wash/30 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-ink">{api.name}</span>
                    <span className="rounded bg-wash px-1.5 py-0.5 text-[10px] font-mono text-muted border border-line">
                      {api.protocol}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] text-ok font-medium">
                    <CheckCircle size={12} weight="fill" />
                    {api.auth}
                  </span>
                </div>

                <p className="text-xs text-soft leading-relaxed">{api.purpose}</p>

                <div className="flex items-center justify-between text-[11px] pt-1 text-muted">
                  <span className="font-mono truncate max-w-[340px] text-muted/80">{api.endpoint}</span>
                  <a
                    href={api.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-soft hover:text-ink hover:underline shrink-0"
                  >
                    Dokumentation
                    <ArrowSquareOut size={11} weight="bold" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-line px-6 py-3 bg-surface text-xs text-muted flex items-center justify-between">
          <span>MarkenFrei · MIT Open Source</span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-soft"
          >
            Schließen
          </button>
        </footer>
      </div>
    </div>
  );
}
