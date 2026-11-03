"use client";

import { useEffect } from "react";
import { X } from "@phosphor-icons/react";
import {
  PROVIDERS,
  getProvider,
  type LlmConfig,
  type ProviderId,
} from "@/lib/providers";

const field =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 focus:border-ink focus:outline-none";

export function SettingsDialog({
  config,
  onChange,
  onClose,
  ollama,
}: {
  config: LlmConfig;
  onChange: (next: LlmConfig) => void;
  onClose: () => void;
  ollama: { running: boolean; models: string[] };
}) {
  const meta = getProvider(config.provider);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick = (id: ProviderId) => {
    const p = getProvider(id);
    if (!p) return;
    onChange({
      provider: id,
      model: p.models[0]?.id ?? "",
      apiKey: config.apiKey,
      baseUrl: p.defaultBaseUrl ?? "",
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-ink/20 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Modell wählen"
        onClick={(e) => e.stopPropagation()}
        className="fade-up w-full max-w-md rounded-xl border border-line bg-surface p-6"
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-base font-medium">Namensgenerator</h2>
            <p className="mt-1 text-sm text-muted">
              Ohne Schlüssel arbeitet die Open-Data-Engine. Für KI-Vorschläge
              wähle einen Anbieter.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="cursor-pointer rounded-md p-1.5 text-muted hover:bg-wash hover:text-ink"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Anbieter</span>
            <select
              value={config.provider}
              onChange={(e) => pick(e.target.value as ProviderId)}
              className={field}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {meta && <p className="mt-1.5 text-xs text-muted">{meta.badge}</p>}
          </label>

          {meta && meta.models.length > 1 && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Modell</span>
              <select
                value={config.model}
                onChange={(e) => onChange({ ...config, model: e.target.value })}
                className={field}
              >
                {meta.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {meta?.needsKey && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">
                API-Schlüssel
              </span>
              <input
                type="password"
                value={config.apiKey}
                onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
                placeholder={meta.keyPrefix ? `${meta.keyPrefix}…` : ""}
                autoComplete="off"
                className={field}
              />
              <p className="mt-1.5 text-xs text-muted">
                Bleibt in deinem Browser (localStorage).
                {meta.keyHost && (
                  <>
                    {" "}
                    <a
                      href={`https://${meta.keyHost}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      Schlüssel erstellen
                    </a>
                  </>
                )}
              </p>
            </label>
          )}

          {meta?.needsBaseUrl && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Basis-URL</span>
              <input
                type="text"
                value={config.baseUrl ?? ""}
                onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
                className={`${field} font-mono`}
              />
            </label>
          )}

          {config.provider === "ollama" && (
            <p className="rounded-md bg-wash px-3 py-2 text-xs text-soft">
              {ollama.running
                ? `Ollama läuft. Modelle: ${ollama.models.join(", ") || "keine installiert"}`
                : "Ollama ist nicht erreichbar. Starte es mit „ollama serve“."}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-soft active:scale-[0.98]"
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
}
