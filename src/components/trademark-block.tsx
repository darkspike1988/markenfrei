import type { TrademarkPrep } from "@/lib/engine/trademark-prep";
import { CopyButton } from "@/components/copy-button";

/** „Marke: nicht geprüft“ mit Recherche-Vorbereitung, standardmäßig zugeklappt. */
export function TrademarkBlock({ prep, name }: { prep: TrademarkPrep; name: string }) {
  return (
    <details className="group border-t border-line">
      <summary className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-ink">Marke: nicht geprüft</span>
          <span className="text-sm text-muted">Recherche vorbereiten</span>
        </span>
        <span aria-hidden className="toggle-sign text-muted" />
      </summary>

      <div className="space-y-6 px-4 pb-5 text-sm sm:px-5">
        <p className="text-soft">{prep.note}</p>

        <section aria-labelledby={`tm-links-${name}`}>
          <h4 id={`tm-links-${name}`} className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Register durchsuchen
          </h4>
          <ul className="divide-y divide-line rounded-md border border-line">
            {prep.links.map((l) => (
              <li key={l.label} className="px-3 py-2.5">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline">
                  {l.label}
                </a>
                <p className="mt-0.5 text-muted">{l.what}</p>
              </li>
            ))}
          </ul>
        </section>

        {prep.dpmaExpertQuery && (
          <section aria-labelledby={`tm-dpma-${name}`}>
            <h4 id={`tm-dpma-${name}`} className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              DPMA-Expertensuchstring
            </h4>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <code className="block flex-1 rounded-md border border-line bg-wash px-3 py-2 font-mono text-[13px] leading-relaxed text-ink">
                {prep.dpmaExpertQuery}
              </code>
              <CopyButton text={prep.dpmaExpertQuery} className="self-start" />
            </div>
            <p className="mt-1.5 text-muted">In der DPMAregister-Expertenrecherche ins Eingabefeld einfügen.</p>
          </section>
        )}

        {prep.variants.length > 0 && (
          <section aria-labelledby={`tm-var-${name}`}>
            <h4 id={`tm-var-${name}`} className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Schreibvarianten mitsuchen
            </h4>
            <ul className="flex flex-wrap gap-1.5">
              {prep.variants.map((v) => (
                <li key={v} className="rounded border border-line bg-wash px-2 py-0.5 font-mono text-[13px] text-soft">
                  {v}
                </li>
              ))}
            </ul>
          </section>
        )}

        {prep.classes.length > 0 && (
          <section aria-labelledby={`tm-kl-${name}`}>
            <h4 id={`tm-kl-${name}`} className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Klassenvorschlag (Nizza)
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

        <section aria-labelledby={`tm-check-${name}`}>
          <h4 id={`tm-check-${name}`} className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
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
