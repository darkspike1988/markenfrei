"use client";

import { useId, useMemo, useState, type RefObject } from "react";
import Link from "next/link";
import type { Namespace } from "@/lib/engine/types";
import { NAMESPACE_LABEL } from "@/lib/engine/types";
import { groupOptional, selectionSummary, type CheckerConfig, type SourceInfo } from "@/components/checker-config";
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

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Namen prüfen" className="space-y-4">
      <div>
        <label htmlFor={fieldId} className="mb-2 block text-sm font-medium text-ink">
          Name oder Shortlist
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
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
            // Bis zur Hydrierung (inert) nur lesbar: Die Platzhalter-Fassung nähme Eingaben an, und React
            // leert das Feld beim Einhängen der echten Komponente. Lieber kurz gesperrt als Name weg.
            readOnly={inert}
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
                Alle {config.tlds.length} Endungen
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {config.tlds.map((t) => (
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
