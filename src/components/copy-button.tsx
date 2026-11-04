"use client";

import { useEffect, useRef, useState } from "react";

/** Kopiert Text in die Zwischenablage und meldet das Ergebnis per Text (auch für Screenreader). */
export function CopyButton({
  text,
  label = "Kopieren",
  className = "",
}: {
  text: string | (() => string);
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const value = typeof text === "function" ? text() : text;
    try {
      await navigator.clipboard.writeText(value);
      setState("done");
    } catch {
      setState("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex min-h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-sm text-ink transition-colors hover:bg-wash active:scale-[0.98] ${className}`}
    >
      <span aria-live="polite">
        {state === "done" ? "Kopiert" : state === "failed" ? "Nicht kopiert, bitte markieren" : label}
      </span>
    </button>
  );
}
