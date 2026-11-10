"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  /** Für Auswahlmenüs: markiert den gewählten Eintrag (aria-pressed und Haken) */
  pressed?: boolean;
};

/**
 * Kleines Aufklappmenü: ein Schalter (aria-expanded) und eine Liste von Schaltflächen. Schließt bei
 * Auswahl, Escape (Fokus zurück auf den Schalter) und Klick außerhalb. Bewusst ohne role="menu": die
 * Einträge sind normale Schaltflächen und per Tab erreichbar.
 */
export function Menu({
  label,
  items,
  className = "btn-quiet",
  align = "end",
  children,
}: {
  /** Zugänglicher Name des Schalters, falls `children` kein Text ist */
  label?: string;
  items: MenuItem[];
  className?: string;
  /**
   * Kante, an der die Liste ausgerichtet ist: "end" ab kleinen Schirmen rechts, darunter links (Werkzeugleisten,
   * die umbrechen); "always-end" immer rechts (Schalter am rechten Rand, z. B. im Seitenkopf).
   */
  align?: "start" | "end" | "always-end";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={className}
      >
        {children}
      </button>
      <ul
        id={listId}
        hidden={!open}
        className={`card absolute top-full z-30 mt-1.5 min-w-48 p-1 ${
          align === "always-end" ? "right-0" : align === "end" ? "left-0 sm:left-auto sm:right-0" : "left-0"
        }`}
      >
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              aria-pressed={item.pressed}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="btn-quiet w-full justify-between gap-4"
            >
              {item.label}
              {item.pressed && (
                <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
