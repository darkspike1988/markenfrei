"use client";

import { useId, useMemo, useState } from "react";
import { Chevron } from "@/components/chevron";
import { analyzeName, MAX_TYPO_CHECK } from "@/lib/insights";

const HEADING = "mb-2 text-xs font-medium uppercase tracking-wide text-muted";

/** Eine Variante zum Ankreuzen: Name und Beschreibung stehen als Text, nicht nur als Farbe. */
function VariantCheck({
  name,
  label,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <li>
      <label
        className={`inline-flex min-h-8 items-center gap-2 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="size-5 shrink-0 accent-button" />
        <span className="font-mono text-[13px] text-ink">{name}</span>
        <span className="text-muted">{label}</span>
      </label>
    </li>
  );
}

/**
 * „Name im Detail“: Tatsachen und benannte Heuristiken zum Namen, ohne Punktwert und ohne
 * Bewertung. Alles entsteht im Browser aus dem Namen, es gibt keine Anfrage.
 */
export function NameInsights({
  name,
  onCheckVariants,
}: {
  name: string;
  /** Prüft das Original zusammen mit den gewählten Varianten als Shortlist */
  onCheckVariants?: (original: string, variants: string[]) => void;
}) {
  const uid = useId();
  const insights = useMemo(() => analyzeName(name), [name]);
  const [picked, setPicked] = useState<string[]>(() => insights.variantCandidates.slice(0, MAX_TYPO_CHECK));
  const full = picked.length >= MAX_TYPO_CHECK;

  const toggle = (v: string) =>
    setPicked((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : cur.length >= MAX_TYPO_CHECK ? cur : [...cur, v]));

  const check = (v: string, label: string, key: string) => (
    <VariantCheck
      key={key}
      name={v}
      label={label}
      checked={picked.includes(v)}
      disabled={!picked.includes(v) && full}
      onChange={() => toggle(v)}
    />
  );

  return (
    <details className="group border-t border-line pt-1">
      <summary className="flex min-h-11 items-center justify-between gap-3 py-2">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-ink">Name im Detail</span>
          <span className="text-sm text-muted">Fakten und Heuristiken, keine Bewertung</span>
        </span>
        <Chevron className="text-muted" />
      </summary>

      <div className="space-y-6 pb-2 pt-1 text-sm">
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-1">
          {insights.facts.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-muted">{f.label}</dt>
              <dd className="font-mono text-[13px] text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>

        {insights.registryNotes.length > 0 && (
          <section aria-labelledby={`${uid}-reg`}>
            <h4 id={`${uid}-reg`} className={HEADING}>
              Folgen für Register und Dienste
            </h4>
            <ul className="list-disc space-y-1 pl-5 text-soft marker:text-muted">
              {insights.registryNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby={`${uid}-conf`}>
          <h4 id={`${uid}-conf`} className={HEADING}>
            Leicht zu verwechseln
          </h4>
          {insights.confusables.length === 0 ? (
            <p className="text-muted">Keines der Paare l / I / 1, o / 0, rn / m, vv / w kommt vor.</p>
          ) : (
            <ul className="space-y-3">
              {insights.confusables.map((c) => (
                <li key={c.pair}>
                  <p className="text-soft">
                    <span className="font-mono text-[13px] text-ink">{c.pair}</span>: {c.text} Im Namen: {c.found.join(", ")}.
                  </p>
                  {c.lookalikes.length > 0 && (
                    <ul className="mt-1 flex flex-wrap gap-x-5">
                      {c.lookalikes.map((v) => check(v, "ähnlich aussehende Schreibweise", `${c.pair}-${v}`))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby={`${uid}-typo`}>
          <h4 id={`${uid}-typo`} className={HEADING}>
            Doppelzeichen und Tippfehler
          </h4>
          <p className="text-soft">
            {insights.doubleLetters.length > 0
              ? `Doppelzeichen im Namen: ${insights.doubleLetters.join(", ")}. Die Schreibweise mit einem Zeichen ist ein naheliegender Tippfehler.`
              : "Keine Doppelzeichen im Namen. Ein ungewollt doppeltes Zeichen ist trotzdem ein möglicher Tippfehler."}
          </p>
          {insights.typos.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-x-5">{insights.typos.map((t) => check(t.name, t.label, `typo-${t.name}`))}</ul>
          )}
        </section>

        {onCheckVariants && insights.variantCandidates.length > 0 && (
          <div className="space-y-1.5">
            <button
              type="button"
              disabled={picked.length === 0}
              onClick={() => onCheckVariants(insights.name, picked)}
              className="inline-flex min-h-10 items-center rounded-md border border-line-strong px-4 text-sm font-medium text-ink hover:bg-wash disabled:cursor-not-allowed disabled:opacity-60"
            >
              Tippfehler-Varianten prüfen{picked.length > 0 ? ` (${picked.length})` : ""}
            </button>
            <p className="text-muted">
              Prüft {insights.name} und die angekreuzten Varianten (höchstens {MAX_TYPO_CHECK}) als Shortlist. Die bisherige
              Liste im Eingabefeld wird dabei ersetzt.
            </p>
          </div>
        )}

        <section aria-labelledby={`${uid}-brand`}>
          <h4 id={`${uid}-brand`} className={HEADING}>
            Ähnlichkeit zu bekannten Marken
          </h4>
          {insights.brands.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-soft marker:text-muted">
              {insights.brands.map((b) => (
                <li key={b.brand}>
                  {insights.name} {b.text}
                </li>
              ))}
              {insights.brandTotal > insights.brands.length && (
                <li>{insights.brandTotal - insights.brands.length} weitere Treffer in der Liste</li>
              )}
            </ul>
          ) : (
            <p className="text-soft">Kein Treffer in der Liste.</p>
          )}
          <p className="mt-1.5 text-muted">
            Heuristik gegen {insights.brandListSize} bekannte Tech-Marken (Kölner Phonetik und Schreibabstand), kein
            Markenregister. Kein Treffer sagt nichts über Marken im Register.
          </p>
        </section>

        <p className="text-muted">
          Die Silbenzahl ist geschätzt. Markenfrei bewertet nicht, wie gut sich ein Name aussprechen oder merken lässt.
        </p>
      </div>
    </details>
  );
}
