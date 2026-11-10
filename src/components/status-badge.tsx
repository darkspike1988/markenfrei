import type { Status } from "@/lib/engine/types";
import { STATUS_LABEL, VERDICT_LABEL, type Verdict } from "@/lib/engine/verdict";

const VERDICT_STYLE: Record<Verdict, { box: string; lamp: string; word: string }> = {
  green: { box: "bg-ok-bg text-ok", lamp: "lamp-ok", word: "Grün" },
  yellow: { box: "bg-warn-bg text-warn", lamp: "lamp-warn", word: "Gelb" },
  red: { box: "bg-bad-bg text-bad", lamp: "lamp-bad", word: "Rot" },
};

/** Ampel als Stempel: Farbe, Lampe und Text (nie nur Farbe). */
export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict; size?: "sm" | "md" }) {
  const s = VERDICT_STYLE[verdict];
  return (
    <span className={`stamp ${size === "md" ? "stamp-md" : ""} ${s.box}`}>
      <span aria-hidden className={`lamp size-1.5 ${s.lamp}`} />
      <span>
        <span className="sr-only">Ampel {s.word}: </span>
        {VERDICT_LABEL[verdict]}
      </span>
    </span>
  );
}

const STATUS_STYLE: Record<Status, { text: string; lamp: string }> = {
  taken: { text: "text-bad", lamp: "lamp-bad" },
  invalid: { text: "text-bad", lamp: "lamp-bad" },
  not_found: { text: "text-ok", lamp: "lamp-ok" },
  similar: { text: "text-warn", lamp: "lamp-warn" },
  unknown: { text: "text-muted", lamp: "lamp-unknown" },
};

/** Lampenklasse je Status einer Quelle; ein schwacher Treffer leuchtet höchstens gelb. */
export function statusLamp(status: Status, weak?: boolean): string {
  return (weak && status === "taken" ? STATUS_STYLE.similar : STATUS_STYLE[status]).lamp;
}

/** Status einer Quelle: Lampe plus Text. Schwache Treffer höchstens in Gelb. */
export function StatusText({ status, weak }: { status: Status; weak?: boolean }) {
  const s = weak && status === "taken" ? STATUS_STYLE.similar : STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium ${s.text}`}>
      <span aria-hidden className={`lamp size-2 ${s.lamp}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
