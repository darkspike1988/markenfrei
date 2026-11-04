import type { Status } from "@/lib/engine/types";
import { STATUS_LABEL, VERDICT_LABEL, type Verdict } from "@/lib/engine/verdict";

const VERDICT_STYLE: Record<Verdict, { box: string; dot: string; word: string }> = {
  green: { box: "bg-ok-bg text-ok", dot: "bg-ok", word: "Grün" },
  yellow: { box: "bg-warn-bg text-warn", dot: "bg-warn", word: "Gelb" },
  red: { box: "bg-bad-bg text-bad", dot: "bg-bad", word: "Rot" },
};

/** Ampel mit Farbe, Form und Text (nie nur Farbe). */
export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict; size?: "sm" | "md" }) {
  const s = VERDICT_STYLE[verdict];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md font-medium ${s.box} ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      }`}
    >
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${s.dot}`} />
      <span>
        <span className="sr-only">Ampel {s.word}: </span>
        {VERDICT_LABEL[verdict]}
      </span>
    </span>
  );
}

const STATUS_STYLE: Record<Status, { text: string; mark: string }> = {
  taken: { text: "text-bad", mark: "bg-bad" },
  invalid: { text: "text-bad", mark: "bg-bad" },
  not_found: { text: "text-ok", mark: "bg-ok" },
  similar: { text: "text-warn", mark: "bg-warn" },
  unknown: { text: "text-muted", mark: "border border-muted bg-transparent" },
};

/** Status einer Quelle: kleines Zeichen plus Text. Schwache Treffer höchstens in Gelb. */
export function StatusText({ status, weak }: { status: Status; weak?: boolean }) {
  const s = weak && status === "taken" ? STATUS_STYLE.similar : STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium ${s.text}`}>
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${s.mark}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
