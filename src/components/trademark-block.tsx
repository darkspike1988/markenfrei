"use client";

import { useMemo, useRef, useState } from "react";
import { NICE_CLASSES, trademarkPrepForSelection, type TrademarkPrep } from "@/lib/engine/trademark-prep";
import { Chevron } from "@/components/chevron";
import { CopyButton } from "@/components/copy-button";

/** Nizza: Klassen 1 bis 34 sind Waren, 35 bis 45 Dienstleistungen. */
const CLASS_GROUPS = [
  { label: "Waren (1 bis 34)", list: NICE_CLASSES.filter((c) => c.number <= 34) },
  { label: "Dienstleistungen (35 bis 45)", list: NICE_CLASSES.filter((c) => c.number >= 35) },
];

/**
 * „Marke: nicht geprüft“ mit Recherche-Vorbereitung, standardmäßig zugeklappt. Startet mit der
 * Vorbereitung vom Server; Produktbeschreibung und Klassenwahl rechnen sie im Browser neu, ohne Anfrage.
 */
export function TrademarkBlock({ prep: serverPrep, name }: { prep: TrademarkPrep; name: string }) {
  const [description, setDescription] = useState("");
  // null: Klassen folgen dem Vorschlag aus der Beschreibung; Liste: eigene Auswahl
  const [chosen, setChosen] = useState<number[] | null>(null);
  const classesRef = useRef<HTMLFieldSetElement>(null);

  const prep = useMemo(
    () => (description === "" && chosen === null ? serverPrep : trademarkPrepForSelection(name, description, chosen)),
    [serverPrep, name, description, chosen],
  );
  const selected = prep.classes.map((c) => c.number);
  const ownChoice = chosen !== null;

  function restoreSuggestion() {
    setChosen(null);
    classesRef.current?.focus();
  }

  return (
    <details className="border-t border-line">
      <summary className="flex min-h-12 items-center justify-between gap-3 py-2.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-ink">Marke: nicht geprüft</span>
          <span className="text-sm text-muted">Recherche vorbereiten</span>
        </span>
        <Chevron className="text-muted" />
      </summary>

      <div className="space-y-6 pb-4 pt-1 text-sm">
        <p className="text-soft">{prep.note}</p>

        <section aria-labelledby={`tm-links-${name}`}>
          <h4 id={`tm-links-${name}`} className="eyebrow mb-2">
            Register durchsuchen
          </h4>
          <ul className="divide-y divide-line rounded-xl border border-line bg-canvas/50">
            {serverPrep.links.map((l) => (
              <li key={l.label} className="px-3 py-2.5">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline">
                  {l.label}
                </a>
                <p className="mt-0.5 text-muted">{l.what}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby={`tm-produkt-${name}`} className="space-y-4">
          <h4 id={`tm-produkt-${name}`} className="eyebrow">
            Produkt und Klassen
          </h4>
          <div>
            <label htmlFor={`tm-beschreibung-${name}`} className="font-medium text-ink">
              Was ist das Produkt?
            </label>
            <p id={`tm-beschreibung-hinweis-${name}`} className="mt-0.5 text-muted">
              Stichwörter wie „App für Schichtplanung“ oder „Online-Shop mit Chat“ verbessern den Klassenvorschlag. Die
              Beschreibung bleibt in deinem Browser: Sie wird nicht gespeichert und nirgendwohin gesendet.
            </p>
            <input
              id={`tm-beschreibung-${name}`}
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-describedby={`tm-beschreibung-hinweis-${name}`}
              maxLength={200}
              autoComplete="off"
              className="field mt-2 min-h-11 py-2"
            />
          </div>

          <fieldset ref={classesRef} tabIndex={-1} className="space-y-3 outline-none">
            <legend className="mb-1 font-medium text-ink">Klassen für die Suche (Nizza)</legend>
            <p className="text-muted">
              Gedrückte Klassen stehen im Suchstring. Die gewählten Klassen stehen mit Überschrift in der Liste darunter.
            </p>
            {CLASS_GROUPS.map((g) => (
              <div key={g.label} role="group" aria-label={g.label}>
                <p aria-hidden className="mb-1.5 text-xs text-muted">
                  {g.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {g.list.map((c) => {
                    const label = `Klasse ${c.number}: ${c.heading}`;
                    const pressed = selected.includes(c.number);
                    // Wie <Chip>, aber mit aria-label: sichtbar ist nur die Nummer, vorgelesen die Überschrift dazu
                    return (
                      <button
                        key={c.number}
                        type="button"
                        aria-pressed={pressed}
                        aria-label={label}
                        title={label}
                        onClick={() =>
                          setChosen(
                            pressed
                              ? selected.filter((n) => n !== c.number)
                              : [...selected, c.number].sort((a, b) => a - b),
                          )
                        }
                        className="chip min-w-10 justify-center font-mono"
                      >
                        {c.number}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p aria-live="polite" className="text-soft">
                {selected.length === 0
                  ? "Keine Klasse gewählt: Der Suchstring sucht in allen Klassen."
                  : `${ownChoice ? "Eigene Auswahl" : "Vorschlag"}: ${selected.length === 1 ? "Klasse" : "Klassen"} ${selected.join(", ")}`}
              </p>
              {ownChoice && (
                <button type="button" onClick={restoreSuggestion} className="btn-quiet -mx-0.5">
                  Vorschlag wiederherstellen
                </button>
              )}
            </div>
          </fieldset>
        </section>

        {prep.classes.length > 0 && (
          <section aria-labelledby={`tm-kl-${name}`}>
            <h4 id={`tm-kl-${name}`} className="eyebrow mb-2">
              {ownChoice ? "Gewählte Klassen (Nizza)" : "Klassenvorschlag (Nizza)"}
            </h4>
            <ul className="space-y-1.5">
              {prep.classes.map((c) => (
                <li key={c.number}>
                  <span className="font-medium text-ink">{c.title}</span>
                  <span className="text-muted">: {c.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {prep.dpmaExpertQuery && (
          <section aria-labelledby={`tm-dpma-${name}`}>
            <h4 id={`tm-dpma-${name}`} className="eyebrow mb-2">
              DPMA-Expertensuchstring
            </h4>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <code className="block flex-1 rounded-xl border border-line bg-wash px-3.5 py-2.5 font-mono text-[13px] leading-relaxed text-ink">
                {prep.dpmaExpertQuery}
              </code>
              <CopyButton text={prep.dpmaExpertQuery} className="self-start" />
            </div>
            <p className="mt-1.5 text-muted">In der DPMAregister-Expertenrecherche ins Eingabefeld einfügen.</p>
          </section>
        )}

        {prep.variants.length > 0 && (
          <section aria-labelledby={`tm-var-${name}`}>
            <h4 id={`tm-var-${name}`} className="eyebrow mb-2">
              Schreibvarianten mitsuchen
            </h4>
            <ul className="flex flex-wrap gap-1.5">
              {prep.variants.map((v) => (
                <li key={v} className="tag">
                  {v}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby={`tm-check-${name}`}>
          <h4 id={`tm-check-${name}`} className="eyebrow mb-2">
            Checkliste
          </h4>
          <ol className="list-decimal space-y-1.5 pl-5 text-soft marker:text-muted">
            {prep.checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
        </section>
      </div>
    </details>
  );
}
