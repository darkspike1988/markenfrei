"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { splitNames } from "@/components/checker-config";
import { Chevron } from "@/components/chevron";
import { Chip } from "@/components/chip";
import { buildShortlist, generateVariants, VARIANT_PREFIXES, VARIANT_SUFFIXES } from "@/lib/insights";
import { normalizeName } from "@/lib/name";

function toggled(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/**
 * „Varianten“: Muster-Chips (Präfixe, Suffixe, Bindestrich, Plural) bauen aus einem einzelnen
 * Namen im Eingabefeld eine Kandidatenliste. Die Kandidaten entstehen im Browser nach festen
 * Regeln, ungeprüft, bis du „Alle prüfen“ wählst.
 */
export function VariantPicker({
  text,
  max,
  onUse,
}: {
  /** Aktueller Inhalt des Eingabefelds */
  text: string;
  /** Höchstzahl Namen je Prüfung */
  max: number;
  onUse: (names: string[]) => void;
}) {
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [suffixes, setSuffixes] = useState<string[]>([]);
  const [hyphen, setHyphen] = useState(false);
  const [plural, setPlural] = useState(false);

  const typed = splitNames(text);
  const base = typed.length === 1 ? typed[0] : null;
  const normalized = base === null ? null : normalizeName(base);
  const baseName = normalized?.ok ? normalized.name : null;

  const variants = base === null ? [] : generateVariants(base, { prefixes, suffixes, hyphen, plural });
  const shortlist = baseName === null ? null : buildShortlist(baseName, variants.map((v) => v.name), max);
  const chosen = prefixes.length + suffixes.length + (hyphen ? 1 : 0) + (plural ? 1 : 0);

  let hint = "";
  if (typed.length === 0) hint = "Gib oben einen Namen ein, dann kannst du Muster wählen.";
  else if (typed.length > 1) hint = `Varianten gibt es für einen einzelnen Namen. Im Feld stehen gerade ${typed.length} Namen.`;
  else if (normalized && !normalized.ok) hint = normalized.error;

  return (
    <details className="card">
      <summary className="flex min-h-16 items-center gap-3 rounded-[1.0625rem] px-4 py-3 transition-colors hover:bg-wash/50 sm:px-5">
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">Varianten</span>
          <span className="block text-sm text-muted">Präfixe, Suffixe, Bindestrich</span>
        </span>
        <Chevron className="text-muted" />
      </summary>
      <div className="space-y-4 border-t border-line px-4 pb-5 pt-4 sm:px-5">
        <p className="text-sm text-muted">
          Feste Muster zum Namen im Eingabefeld, ohne KI. Die Kandidaten sind ungeprüft, bis du sie prüfst.
        </p>

        <fieldset>
          <legend className="eyebrow mb-2">Präfixe</legend>
          <div className="flex flex-wrap gap-1.5">
            {VARIANT_PREFIXES.map((p) => (
              <Chip key={p} pressed={prefixes.includes(p)} onClick={() => setPrefixes((c) => toggled(c, p))}>
                <span className="font-mono">{p}-</span>
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="eyebrow mb-2">Suffixe</legend>
          <div className="flex flex-wrap gap-1.5">
            {VARIANT_SUFFIXES.map((s) => (
              <Chip key={s} pressed={suffixes.includes(s)} onClick={() => setSuffixes((c) => toggled(c, s))}>
                <span className="font-mono">-{s}</span>
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="eyebrow mb-2">Schreibweise</legend>
          <div className="flex flex-wrap gap-1.5">
            <Chip pressed={hyphen} onClick={() => setHyphen((v) => !v)}>
              mit und ohne Bindestrich
            </Chip>
            <Chip pressed={plural} onClick={() => setPlural((v) => !v)}>
              Plural / Singular (s)
            </Chip>
          </div>
          <p className="mt-1.5 text-[13px] text-muted">
            Bindestrich: aus „wach werk“ werden wachwerk und wach-werk, Präfixe und Suffixe entstehen zusätzlich mit
            Bindestrich.
          </p>
        </fieldset>

        <div aria-live="polite" className="space-y-3">
          {hint && <p className="text-sm text-muted">{hint}</p>}
          {!hint && chosen === 0 && <p className="text-sm text-muted">Wähle mindestens ein Muster.</p>}
          {!hint && chosen > 0 && variants.length === 0 && (
            <p className="text-sm text-muted">Aus diesen Mustern entstehen keine neuen gültigen Namen.</p>
          )}
          {shortlist && variants.length > 0 && (
            <>
              <ul className="flex flex-wrap gap-1.5" aria-label="Kandidaten">
                {shortlist.names.map((n, i) => (
                  <li
                    key={n}
                    title={i === 0 ? "dein Name" : variants.find((v) => v.name === n)?.label}
                    className="tag"
                  >
                    {n}
                    {i === 0 && <span className="font-sans text-muted"> (dein Name)</span>}
                  </li>
                ))}
              </ul>
              {shortlist.dropped > 0 && (
                <p className="text-sm text-warn">
                  Höchstens {max} Namen auf einmal: dein Name und die ersten {max - 1} Varianten werden geprüft,{" "}
                  {shortlist.dropped} weitere fallen weg. Wähle weniger Muster, um alle zu prüfen.
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  trackEvent("varianten/muster");
                  onUse(shortlist.names);
                }}
                className="btn btn-primary"
              >
                Alle prüfen ({shortlist.names.length})
              </button>
            </>
          )}
        </div>
      </div>
    </details>
  );
}
