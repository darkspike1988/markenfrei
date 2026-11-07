"use client";

import { useEffect, type RefObject } from "react";

/**
 * Drucken (Strg+P): alle Berichtszeilen aufklappen und danach den alten Zustand wiederherstellen.
 * CSS allein kann ein geschlossenes <details> nicht in allen Browsern öffnen.
 */
export function usePrintExpand(container: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const opened: HTMLDetailsElement[] = [];
    const expand = () => {
      container.current?.querySelectorAll<HTMLDetailsElement>("details[id^='bericht-']").forEach((d) => {
        if (!d.open) {
          d.open = true;
          opened.push(d);
        }
      });
    };
    const restore = () => {
      for (const d of opened.splice(0)) d.open = false;
    };
    const media = window.matchMedia?.("print");
    const onMedia = (e: MediaQueryListEvent) => (e.matches ? expand() : restore());
    window.addEventListener("beforeprint", expand);
    window.addEventListener("afterprint", restore);
    media?.addEventListener("change", onMedia);
    return () => {
      window.removeEventListener("beforeprint", expand);
      window.removeEventListener("afterprint", restore);
      media?.removeEventListener("change", onMedia);
    };
  }, [container]);
}
