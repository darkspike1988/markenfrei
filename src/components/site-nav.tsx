"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** `wide`: nur ab sm im Seitenkopf; darunter reicht die Breite nicht, der Link steht auch in der Fußzeile. */
const LINKS = [
  { href: "/quellen", label: "Quellen", wide: false },
  { href: "/mcp", label: "MCP", wide: false },
  { href: "/api-docs", label: "API", wide: true },
] as const;

/** Hauptnavigation; die aktuelle Seite ist mit aria-current und einem Strich markiert, nicht nur mit Farbe. */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Hauptnavigation" className="flex items-center text-sm sm:gap-0.5">
      {LINKS.map((l) => {
        const current = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={current ? "page" : undefined}
            className={`relative min-h-9 shrink-0 items-center whitespace-nowrap rounded-lg px-2 transition-colors hover:bg-wash hover:text-ink sm:px-3 ${
              l.wide ? "hidden sm:inline-flex" : "inline-flex"
            } ${current ? "font-medium text-ink" : "text-soft"}`}
          >
            {l.label}
            {current && <span aria-hidden className="absolute inset-x-2 bottom-1 h-px bg-ink sm:inset-x-3" />}
          </Link>
        );
      })}
    </nav>
  );
}
