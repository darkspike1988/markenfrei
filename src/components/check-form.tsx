"use client";

import { useId, useMemo, useState, type RefObject } from "react";
import Link from "next/link";
import type { Namespace } from "@/lib/engine/types";
import { NAMESPACE_LABEL } from "@/lib/engine/types";
import { findTld, groupFeaturedTlds, groupOptional, selectionSummary, type CheckerConfig, type SourceInfo } from "@/components/checker-config";
import { Chevron } from "@/components/chevron";
import { Chip } from "@/components/chip";

/**
 * Eingabeformular des Prüfers: Namensfeld, Absenden und aufklappbare Auswahl von Namensräumen,
 * Endungen und weiteren Quellen. Hält keinen Zustand außer der Auswahl-Anzeige; Eingaben und
 * Fehlermeldung gehören dem Aufrufer.
 */
export function CheckerForm({
  config,
  inert,
  text,
  onTextChange,
  fieldRef,
  formError,
  namespaces,
  tlds,
  extra,
  onSubmit,
  onToggleNs,
  onToggleTld,
  onToggleExtra,
}: {
  config: CheckerConfig;
  inert: boolean;
  text: string;
  onTextChange: (value: string) => void;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  formError: string;
  namespaces: Namespace[];
  tlds: string[];
  extra: string[];
  onSubmit: (e: React.FormEvent) => void;
  onToggleNs: (ns: Namespace) => void;
  onToggleTld: (tld: string) => void;
  onToggleExtra: (id: string) => void;
}) {
  const fieldId = useId();
  const hintId = useId();
  const errorId = useId();
  const optionalGroups = useMemo(() => groupOptional(config.sources), [config.sources]);
  const domainsOn = namespaces.includes("domains");
  const featuredGroups = useMemo(() => groupFeaturedTlds(config.featuredTlds), [config.featuredTlds]);
  const tldSearchId = useId();
  const tldListId = useId();
  const tldNoteId = useId();
  const [tldQuery, setTldQuery] = useState("");
  const [tldNote, setTldNote] = useState("");

  /** Übernimmt die Endung aus dem Suchfeld, wenn sie existiert und noch Platz ist. */
  function addSearchedTld() {
    const t = findTld(tldQuery, config.tlds);
    if (!t) {
      setTldNote(tldQuery.trim() ? `„${tldQuery.trim().slice(0, 30)}“ ist keine unterstützte Endung.` : "Bitte eine Endung eingeben.");
      return;
    }
    if (tlds.includes(t)) {
      setTldNote(`.${t} ist schon gewählt.`);
    } else if (tlds.length >= config.maxTlds) {
      setTldNote(`Höchstens ${config.maxTlds} Endungen pro Prüfung.`);
    } else {
      onToggleTld(t);
      setTldNote(`.${t} hinzugefügt.`);
      setTldQuery("");
      return;
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Namen prüfen" className="space-y-4">
      <div>
        <label htmlFor={fieldId} className="mb-2 block text-sm font-medium text-ink">
          Name oder Shortlist
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <textarea
            id={fieldId}
            ref={fieldRef}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            placeholder="z. B. wachwerk oder wachwerk, schichtflux, planzeit"
            aria-describedby={`${hintId}${formError ? ` ${errorId}` : ""}`}
            aria-invalid={formError ? true : undefined}
            className="auto-grow w-full flex-1 resize-none rounded-lg border border-line-strong bg-surface px-3.5 py-3 font-mono text-base text-ink placeholder:font-sans placeholder:text-muted hover:border-muted"
          />
          <button
            type="submit"
            disabled={inert}
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg bg-button px-6 font-medium text-button-ink transition-colors hover:bg-button-hover active:scale-[0.98] disabled:opacity-60"
          >
            Prüfen
          </button>
        </div>
        <p id={hintId} className="mt-2 text-sm text-muted">
          Bis zu {config.maxNames} Namen, mit Komma getrennt
        </p>
        {formError && (
          <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-bad">
            {formError}
          </p>
        )}
      </div>

      <details>
        <summary className="flex min-h-8 items-center justify-between gap-3 text-sm">
          <span className="min-w-0 text-muted">{selectionSummary({ namespaces, tlds, extra }, config)}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-soft underline hover:text-ink">
            Anpassen
            <Chevron />
          </span>
        </summary>

        <div className="mt-3 space-y-5 border-t border-line pt-4">
          <fieldset>
            <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Namensräume</legend>
            <div className="flex flex-wrap gap-1.5">
              {config.namespaces.map((n) => (
                <Chip key={n.id} pressed={namespaces.includes(n.id)} onClick={() => onToggleNs(n.id)}>
                  {n.label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={!domainsOn} className="disabled:opacity-60">
            <legend className="mb-2 flex w-full flex-wrap items-baseline justify-between gap-x-3 text-xs font-medium uppercase tracking-wide text-muted">
              <span>Endungen</span>
              <span className="font-normal normal-case tracking-normal">
                {domainsOn ? `${tlds.length} von höchstens ${config.maxTlds}` : "Domains abgewählt"}
              </span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {tlds.map((t) => (
                <Chip key={t} pressed onClick={() => onToggleTld(t)} mono>
                  .{t}
                  <span className="sr-only"> (abwählen)</span>
                </Chip>
              ))}
            </div>
            <details className="mt-2">
              <summary className="inline-flex min-h-8 items-center gap-1.5 text-sm text-soft hover:text-ink">
                <span aria-hidden className="toggle-sign" />
                Endungen wählen oder suchen
              </summary>
              <div className="mt-2 space-y-3">
                {featuredGroups.map((g) => (
                  <div key={g.label}>
                    <p className="mb-1 text-xs text-muted">{g.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.tlds.map((t) => (
                        <Chip
                          key={t}
                          mono
                          pressed={tlds.includes(t)}
                          disabled={!tlds.includes(t) && tlds.length >= config.maxTlds}
                          onClick={() => onToggleTld(t)}
                        >
                          .{t}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
                <div>
                  <label htmlFor={tldSearchId} className="mb-1 block text-xs text-muted">
                    Weitere Endung suchen ({config.tlds.length - config.featuredTlds.length} zur Auswahl)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={tldSearchId}
                      type="text"
                      list={tldListId}
                      value={tldQuery}
                      onChange={(e) => {
                        setTldQuery(e.target.value);
                        setTldNote("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSearchedTld();
                        }
                      }}
                      spellCheck={false}
                      autoCapitalize="none"
                      autoComplete="off"
                      aria-describedby={tldNote ? tldNoteId : undefined}
                      placeholder="z. B. shop"
                      className="min-h-9 w-40 rounded-lg border border-line-strong bg-surface px-3 font-mono text-sm text-ink placeholder:font-sans placeholder:text-muted hover:border-muted"
                    />
                    <datalist id={tldListId}>
                      {config.tlds
                        .filter((t) => !config.featuredTlds.includes(t))
                        .map((t) => (
                          <option key={t} value={t} />
                        ))}
                    </datalist>
                    <button
                      type="button"
                      onClick={addSearchedTld}
                      className="min-h-9 rounded-lg border border-line-strong px-3 text-sm text-ink hover:border-muted"
                    >
                      Hinzufügen
                    </button>
                  </div>
                  {tldNote && (
                    <p id={tldNoteId} role="status" className="mt-1 text-[13px] text-muted">
                      {tldNote}
                    </p>
                  )}
                  <p className="mt-1 text-[13px] text-muted">
                    Nur {config.featuredTlds.length} Endungen sind einzeln geprüft. Bei den übrigen bedeutet „nicht gefunden“
                    der Registry nie „frei“, das Ergebnis bleibt dann offen.
                  </p>
                </div>
              </div>
            </details>
          </fieldset>

          {optionalGroups.length > 0 && (
            <fieldset>
              <legend className="mb-1 flex w-full flex-wrap items-baseline justify-between gap-x-3 text-xs font-medium uppercase tracking-wide text-muted">
                <span>Weitere Quellen</span>
                <span className="font-normal normal-case tracking-normal">
                  {extra.length > 0 ? `${extra.length} gewählt` : "keine gewählt"}
                </span>
              </legend>
              <div className="divide-y divide-line border-y border-line">
                {optionalGroups.map((g) => (
                  <ExtraGroup key={g.ns} ns={g.ns} list={g.list} extra={extra} onToggle={onToggleExtra} />
                ))}
              </div>
              <p className="mt-2 text-[13px] text-muted">
                Was jede Quelle prüft, steht unter{" "}
                <Link href="/quellen" className="underline hover:text-ink">
                  Quellen
                </Link>
                .
              </p>
            </fieldset>
          )}
        </div>
      </details>
    </form>
  );
}


/** Zusatzquellen eines Namensraums als einzeilige Chip-Reihe, eingeklappt mit Zähler („Pakete +14“). */
function ExtraGroup({
  ns,
  list,
  extra,
  onToggle,
}: {
  ns: Namespace;
  list: SourceInfo[];
  extra: string[];
  onToggle: (id: string) => void;
}) {
  const chosen = list.filter((s) => extra.includes(s.id)).length;
  const [open, setOpen] = useState(chosen > 0);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex min-h-9 items-center justify-between gap-3 text-sm">
        <span>
          <span className="font-medium text-ink">{NAMESPACE_LABEL[ns]}</span>{" "}
          <span className="text-muted">+{list.length}</span>
          {chosen > 0 && <span className="text-muted"> · {chosen} gewählt</span>}
        </span>
        <Chevron className="text-muted" />
      </summary>
      <div className="flex flex-wrap gap-1.5 pb-3 pt-1">
        {list.map((s) => (
          <Chip key={s.id} pressed={extra.includes(s.id)} onClick={() => onToggle(s.id)} title={s.description}>
            {s.label}
          </Chip>
        ))}
      </div>
    </details>
  );
}
