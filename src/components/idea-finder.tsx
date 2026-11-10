"use client";

import { useId, useState } from "react";
import { Chevron } from "@/components/chevron";

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
    <details className="card">
      <summary className="flex min-h-16 items-center gap-3 rounded-[1.0625rem] px-4 py-3 transition-colors hover:bg-wash/50 sm:px-5">
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">Keine Idee?</span>
          <span className="block text-sm text-muted">Vorschläge aus Stichwörtern</span>
        </span>
        <Chevron className="text-muted" />
      </summary>
      <div className="space-y-4 border-t border-line px-4 pb-5 pt-4 sm:px-5">
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
            className="field min-h-11 flex-1 py-2"
          />
          <button
            type="submit"
            disabled={state === "loading"}
            className="btn btn-secondary"
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
                    className="tag"
                  >
                    {c.name}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onUse(ideas.map((c) => c.name))}
                className="btn btn-primary"
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
