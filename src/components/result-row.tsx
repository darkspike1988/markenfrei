"use client";

import { CaretRight } from "@phosphor-icons/react";
import type { ClearanceReport } from "@/app/api/clearance/route";
import { TONE_CLASS, TONE_DOT, VERDICT, buildSignals } from "@/lib/verdict";

export function DomainChip({
  tld,
  status,
}: {
  tld: string;
  status: "available" | "taken" | "unknown";
}) {
  const style =
    status === "available"
      ? "bg-ok-bg text-ok"
      : status === "taken"
        ? "text-muted line-through decoration-muted/50"
        : "text-muted";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs ${style}`}
      title={
        status === "available"
          ? "Frei"
          : status === "taken"
            ? "Vergeben"
            : "Nicht ermittelbar"
      }
    >
      .{tld}
      {status === "unknown" && "?"}
    </span>
  );
}

export function ResultRow({
  report,
  index,
  onOpen,
}: {
  report: ClearanceReport;
  index: number;
  onOpen: () => void;
}) {
  const verdict = VERDICT[report.matrixScore.verdict];
  const lead = buildSignals(report)[0];

  return (
    <li className="fade-up" style={{ ["--i" as string]: index }}>
      <button
        type="button"
        onClick={onOpen}
        className="group grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-1 py-4 text-left transition-colors hover:bg-wash sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] sm:px-3"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span
              className={`size-2 shrink-0 rounded-full ${TONE_DOT[verdict.tone]}`}
              aria-hidden
            />
            <span className="truncate text-lg font-medium tracking-tight">
              {report.name}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1 pl-[18px]">
            {report.domains.map((d) => (
              <DomainChip key={d.tld} tld={d.tld} status={d.status} />
            ))}
          </div>
        </div>

        <p className="order-3 col-span-2 line-clamp-2 pl-[18px] text-sm text-muted sm:order-none sm:col-span-1 sm:pl-0">
          {lead.text}
        </p>

        <div className="flex items-center gap-3 justify-self-end">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASS[verdict.tone]}`}
          >
            {verdict.label}
          </span>
          <CaretRight
            size={14}
            weight="bold"
            className="text-muted transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>
      </button>
    </li>
  );
}

export function ResultSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="skeleton grid grid-cols-[1fr_auto] items-center gap-4 px-1 py-4 sm:px-3"
          style={{ animationDelay: `${i * 120}ms` }}
          aria-hidden
        >
          <div className="space-y-2">
            <div className="h-5 w-32 rounded bg-wash" />
            <div className="h-3.5 w-48 rounded bg-wash" />
          </div>
          <div className="h-6 w-24 rounded-full bg-wash" />
        </li>
      ))}
    </>
  );
}
