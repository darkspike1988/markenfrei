import type { ReactNode } from "react";

export type TocItem = { href: `#${string}`; label: string };

/**
 * Seitenrahmen langer Textseiten: Inhalt links in lesbarer Breite, rechts ab großen Schirmen ein
 * mitlaufendes Inhaltsverzeichnis. Auf kleinen Schirmen steht dasselbe Verzeichnis als Zeile im Text (TocInline).
 */
export function TocLayout({ items, children }: { items: readonly TocItem[]; children: ReactNode }) {
  return (
    <div className="pt-10 sm:pt-16 lg:grid lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-x-14">
      <div className="min-w-0">{children}</div>
      <nav aria-label="Abschnitte" className="hidden lg:block">
        <div className="sticky top-24">
          <p className="eyebrow mb-3">Auf dieser Seite</p>
          <ul className="border-l border-line">
            {items.map((i) => (
              <li key={i.href}>
                <a
                  href={i.href}
                  className="-ml-px flex min-h-8 items-center border-l border-transparent pl-4 text-sm text-muted no-underline transition-colors hover:border-ink hover:text-ink"
                >
                  {i.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
}

/** Dasselbe Verzeichnis als Zeile im Text, solange die Seitenspalte fehlt (kleine Schirme). */
export function TocInline({ items }: { items: readonly TocItem[] }) {
  return (
    <nav aria-label="Abschnitte" className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm lg:hidden">
      {items.map((i) => (
        <a key={i.href} href={i.href} className="inline-block py-1 underline">
          {i.label}
        </a>
      ))}
    </nav>
  );
}
