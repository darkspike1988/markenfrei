"use client";

import { useId, useState } from "react";

type Candidate = { name: string; origin?: string };

function pickCandidates(json: unknown): Candidate[] {
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  const arr = [o.synthesizedCandidates, o.candidates, o.names].find(Array.isArray) as unknown[] | undefined;
  if (!arr) return [];
  const out: Candidate[] = [];
  for (const c of arr) {
    if (typeof c === "string") out.push({ name: c });
    else if (c && typeof c === "object" && typeof (c as Candidate).name === "string") {
      out.push({ name: (c as Candidate).name, origin: (c as Candidate).origin });
    }
  }
  return out;
}

/** „Keine Idee?“: regelbasierte Vorschläge aus Stichwörtern, ein Klick prüft sie. */
export function IdeaFinder({ max, onUse }: { max: number; onUse: (names: string[]) => void }) {
  const fieldId = useId();
  const [keywords, setKeywords] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [ideas, setIdeas] = useState<Candidate[]>([]);

  async function suggest(e: React.FormEvent) {
    e.preventDefault();
    const words = keywords
      .split(/[,\s]+/)
      .map((w) => w.trim())
      .filter(Boolean)
      .slice(0, 6);
    if (!words.length) {
      setState("error");
      setError("Bitte mindestens ein Stichwort eingeben.");
      return;
    }
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/opendata-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: words }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error((json as { error?: string } | null)?.error ?? `Fehler ${res.status}`);
      const list = pickCandidates(json).slice(0, max);
      setIdeas(list);
      setState("idle");
      if (!list.length) {
        setState("error");
        setError("Keine Vorschläge zu diesen Stichwörtern. Andere Wörter versuchen.");
      }
    } catch {
      setState("error");
      setError("Vorschläge konnten nicht geladen werden. Bitte später erneut versuchen.");
    }
  }

  return (
    <details className="group rounded-xl border border-line bg-surface">
      <summary className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <span>
          <span className="font-medium text-ink">Keine Idee?</span>{" "}
          <span className="text-sm text-muted">Vorschläge aus Stichwörtern</span>
        </span>
        <span aria-hidden className="toggle-sign text-muted" />
      </summary>
      <div className="space-y-4 px-4 pb-5 sm:px-5">
        <p className="text-sm text-muted">
          Regelbasiert, ohne KI: Wortstämme aus OpenThesaurus und Datamuse werden nach festen Regeln zu Kunstwörtern
          kombiniert. Die Vorschläge sind ungeprüft, bis du sie prüfst.
        </p>
        <form onSubmit={suggest} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={fieldId} className="sr-only">
            Stichwörter
          </label>
          <input
            id={fieldId}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Stichwörter, z. B. schicht, plan, pflege"
            autoComplete="off"
            className="min-h-10 flex-1 rounded-md border border-line-strong bg-surface px-3 text-ink placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={state === "loading"}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-line-strong px-4 text-sm font-medium text-ink hover:bg-wash disabled:opacity-60"
          >
            {state === "loading" ? "Suche …" : "Vorschläge"}
          </button>
        </form>
        <div aria-live="polite">
          {state === "error" && <p className="text-sm text-bad">{error}</p>}
          {ideas.length > 0 && (
            <div className="space-y-3">
              <ul className="flex flex-wrap gap-1.5">
                {ideas.map((c) => (
                  <li
                    key={c.name}
                    title={c.origin}
                    className="rounded border border-line bg-wash px-2 py-0.5 font-mono text-sm text-soft"
                  >
                    {c.name}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onUse(ideas.map((c) => c.name))}
                className="inline-flex min-h-10 items-center rounded-md bg-button px-4 text-sm font-medium text-button-ink hover:bg-button-hover active:scale-[0.98]"
              >
                {ideas.length === 1 ? "Diesen Namen prüfen" : `Diese ${ideas.length} Namen prüfen`}
              </button>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
