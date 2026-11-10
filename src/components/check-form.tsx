"use client";

import { useEffect, useId, useMemo, useState, type RefObject } from "react";
import Link from "next/link";
import type { Namespace } from "@/lib/engine/types";
import { NAMESPACE_LABEL } from "@/lib/engine/types";
import {
  checkerProfiles,
  findTld,
  groupFeaturedTlds,
  groupOptional,
  groupStandard,
  matchesProfile,
  previewNames,
  selectionSummary,
  type CheckerConfig,
  type NamePreview,
  type Profile,
  type SourceInfo,
} from "@/components/checker-config";
import { Chevron } from "@/components/chevron";
import { Chip } from "@/components/chip";

const LEGEND = "eyebrow mb-2 flex w-full flex-wrap items-baseline justify-between gap-x-3";
const LEGEND_NOTE = "font-sans text-xs font-normal normal-case tracking-normal";

/**
 * Eingabeformular des Prüfers: Namensfeld, Absenden, Vorhaben und aufklappbare Auswahl von Namensräumen,
 * Standardquellen, Endungen und weiteren Quellen. Hält keinen Zustand außer der Auswahl-Anzeige; Eingaben
 * und Fehlermeldung gehören dem Aufrufer.
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
  excluded,
  onSubmit,
  onToggleNs,
  onToggleTld,
  onToggleExtra,
  onToggleStandard,
  onApplyProfile,
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
  /** Abgewählte Standardquellen */
  excluded: string[];
  onSubmit: (e: React.FormEvent) => void;
  onToggleNs: (ns: Namespace) => void;
  onToggleTld: (tld: string) => void;
  onToggleExtra: (id: string) => void;
  onToggleStandard: (id: string) => void;
  onApplyProfile: (profile: Profile) => void;
}) {
  const fieldId = useId();
  const hintId = useId();
  const errorId = useId();
  const profileLabelId = useId();
  const profiles = useMemo(() => checkerProfiles(config), [config]);
  const standardGroups = useMemo(() => groupStandard(config), [config]);
  const excludedActive = standardGroups
    .filter((g) => namespaces.includes(g.ns))
    .reduce((n, g) => n + g.list.filter((s) => excluded.includes(s.id)).length, 0);
  const optionalGroups = useMemo(() => groupOptional(config.sources), [config.sources]);
  const domainsOn = namespaces.includes("domains");
  const featuredGroups = useMemo(() => groupFeaturedTlds(config.featuredTlds), [config.featuredTlds]);
  const tldSearchId = useId();
  const tldListId = useId();
  const tldNoteId = useId();
  const [tldQuery, setTldQuery] = useState("");
  const [tldNote, setTldNote] = useState("");

  const previews = useMemo(() => previewNames(text), [text]);
  const tooMany = previews.length > config.maxNames;
  // Plättchen nur, wenn sie etwas zeigen, das im Feld nicht steht: mehrere Namen, eine Umschreibung, ein Fehler.
  const showTokens =
    previews.length > 1 || previews.some((p) => p.error !== undefined || p.name !== p.input.toLowerCase());

  // Taste „/“ setzt den Cursor ins Namensfeld, außer wenn gerade in einem Feld getippt wird.
  useEffect(() => {
    if (inert) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      fieldRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inert, fieldRef]);

  function removeName(input: string) {
    onTextChange(
      previews
        .filter((p) => p.input !== input)
        .map((p) => p.input)
        .join(", "),
    );
    fieldRef.current?.focus();
  }

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
    <form onSubmit={onSubmit} noValidate aria-label="Namen prüfen" className="space-y-3">
      <div className="console">
        <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={fieldId} className="eyebrow">
              Name oder Shortlist
            </label>
            {previews.length > 0 && (
              <p className={`font-mono text-xs tabular-nums ${tooMany ? "font-medium text-bad" : "text-muted"}`}>
                <span className="sr-only">Eingegebene Namen: </span>
                {previews.length} / {config.maxNames}
              </p>
            )}
          </div>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <span aria-hidden className="select-none pt-1 font-mono text-xl leading-snug text-muted sm:text-2xl">
                ›
              </span>
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
                className="console-input auto-grow py-1 text-xl leading-snug sm:text-2xl"
              />
              {text === "" && (
                <kbd aria-hidden className="kbd mt-1.5 hidden shrink-0 md:inline-flex" title="Taste / setzt den Cursor ins Feld">
                  /
                </kbd>
              )}
            </div>
            <button type="submit" disabled={inert} className="btn btn-primary min-h-12 shrink-0 px-6 text-base">
              Prüfen
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="btn-arrow"
              >
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </button>
          </div>

          <p id={hintId} className="mt-2 text-sm text-muted">
            Bis zu {config.maxNames} Namen, mit Komma getrennt
          </p>

          <div role="group" aria-labelledby={profileLabelId} className="mt-3 flex flex-wrap items-center gap-1.5">
            <span id={profileLabelId} className="eyebrow mr-1.5">
              Vorhaben
            </span>
            {profiles.map((p) => (
              <Chip
                key={p.id}
                pressed={matchesProfile({ namespaces, tlds, extra, excluded }, p, config)}
                onClick={() => onApplyProfile(p)}
              >
                {p.label}
              </Chip>
            ))}
          </div>

          {showTokens && <NameTokens previews={previews} onRemove={removeName} />}

          {formError && (
            <p id={errorId} role="alert" className="mt-3 text-sm font-medium text-bad">
              {formError}
            </p>
          )}
        </div>

        <details className="rounded-b-[1.3rem] border-t border-line bg-wash/50">
          <summary className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm sm:px-6">
            <span className="min-w-0 text-muted">{selectionSummary({ namespaces, tlds, extra, excluded }, config)}</span>
            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-ink">
              Anpassen
              <Chevron />
            </span>
          </summary>

          <div className="space-y-6 border-t border-line px-4 pb-5 pt-5 sm:px-6">
            <fieldset>
              <legend className="eyebrow mb-2">Namensräume</legend>
              <div className="flex flex-wrap gap-1.5">
                {config.namespaces.map((n) => (
                  <Chip key={n.id} pressed={namespaces.includes(n.id)} onClick={() => onToggleNs(n.id)}>
                    {n.label}
                  </Chip>
                ))}
              </div>
            </fieldset>

            {standardGroups.length > 0 && (
              <fieldset>
                <legend className={LEGEND}>
                  <span>Standardquellen</span>
                  <span className={LEGEND_NOTE}>{excludedActive > 0 ? `${excludedActive} abgewählt` : "alle gewählt"}</span>
                </legend>
                <div className="space-y-2">
                  {standardGroups.map((g) => {
                    const on = namespaces.includes(g.ns);
                    return (
                      <div key={g.ns} className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-1.5 min-w-28 text-sm font-medium text-ink">{NAMESPACE_LABEL[g.ns]}</span>
                        {g.list.map((s) => (
                          <Chip
                            key={s.id}
                            pressed={on && !excluded.includes(s.id)}
                            disabled={!on}
                            onClick={() => onToggleStandard(s.id)}
                            title={s.description}
                          >
                            {s.label}
                          </Chip>
                        ))}
                        {!on && <span className="text-[13px] text-muted">Namensraum abgewählt</span>}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <fieldset disabled={!domainsOn} className="disabled:opacity-60">
              <legend className={LEGEND}>
                <span>Endungen</span>
                <span className={LEGEND_NOTE}>
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
                        className="field min-h-9 w-40 rounded-[0.625rem] px-3 py-1 font-mono text-sm placeholder:font-sans"
                      />
                      <datalist id={tldListId}>
                        {config.tlds
                          .filter((t) => !config.featuredTlds.includes(t))
                          .map((t) => (
                            <option key={t} value={t} />
                          ))}
                      </datalist>
                      <button type="button" onClick={addSearchedTld} className="btn btn-secondary btn-sm">
                        Hinzufügen
                      </button>
                    </div>
                    {tldNote && (
                      <p id={tldNoteId} role="status" className="mt-1 text-[13px] text-muted">
                        {tldNote}
                      </p>
                    )}
                    <p className="mt-1 max-w-2xl text-[13px] text-muted">
                      Nur {config.featuredTlds.length} Endungen sind einzeln geprüft. Bei den übrigen bedeutet „nicht gefunden“
                      der Registry nie „frei“, das Ergebnis bleibt dann offen.
                    </p>
                  </div>
                </div>
              </details>
            </fieldset>

            {optionalGroups.length > 0 && (
              <fieldset>
                <legend className={LEGEND}>
                  <span>Weitere Quellen</span>
                  <span className={LEGEND_NOTE}>{extra.length > 0 ? `${extra.length} gewählt` : "keine gewählt"}</span>
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
      </div>
    </form>
  );
}

/**
 * Die erkannten Namen als Plättchen: zeigt vor dem Absenden, was geprüft wird (nach der Normalisierung),
 * was doppelt ist und was kein gültiger Name ist. Jedes Plättchen lässt sich einzeln entfernen.
 */
function NameTokens({ previews, onRemove }: { previews: NamePreview[]; onRemove: (input: string) => void }) {
  const errors = previews.filter((p) => p.error !== undefined);
  return (
    <div className="mt-3 space-y-2">
      <ul aria-label="Erkannte Namen" className="flex flex-wrap gap-1.5">
        {previews.map((p) => {
          const changed = p.name !== null && p.name !== p.input.toLowerCase();
          return (
            <li
              key={p.input}
              className={`tag pr-0.5 ${p.error !== undefined ? "border-bad bg-bad-bg text-bad" : ""} ${p.duplicate ? "border-dashed" : ""}`}
            >
              {changed && (
                <>
                  <span className="font-sans text-muted">{p.input}</span>
                  <span aria-hidden className="text-muted">
                    →
                  </span>
                  <span className="sr-only">wird geprüft als</span>
                </>
              )}
              <span className={p.error !== undefined ? "" : "text-ink"}>{p.name ?? p.input}</span>
              {p.duplicate && <span className="font-sans text-muted">doppelt</span>}
              {p.error !== undefined && <span className="font-sans">ungültig</span>}
              <button
                type="button"
                onClick={() => onRemove(p.input)}
                aria-label={`${p.input} entfernen`}
                className="grid size-6 place-items-center rounded text-muted hover:bg-line hover:text-ink"
              >
                <svg aria-hidden viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M2 2l8 8M10 2l-8 8" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
      {errors.map((p) => (
        <p key={p.input} className="text-[13px] text-bad">
          <span className="font-mono">{p.input}</span>: {p.error}
        </p>
      ))}
    </div>
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
      <summary className="flex min-h-10 items-center justify-between gap-3 text-sm">
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
