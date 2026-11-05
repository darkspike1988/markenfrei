"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { trackPageview } from "@/lib/analytics";

/** Zählt jeden Seitenaufruf einmal, auch bei Navigation ohne Neuladen. Rendert nichts. */
export function PageviewBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    trackPageview(pathname);
  }, [pathname]);
  return null;
}
