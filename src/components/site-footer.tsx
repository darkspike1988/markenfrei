import Link from "next/link";
import { SignalMark } from "@/components/signal-mark";
import { GUIDES } from "@/lib/guides";

const LINK = "inline-flex min-h-7 items-center text-soft underline decoration-line-strong hover:text-ink hover:decoration-ink";

const GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  { title: "Prüfen", links: GUIDES.map((g) => ({ href: g.href, label: g.nav })) },
  {
    title: "Nachschlagen",
    links: [
      { href: "/quellen", label: "Quellen" },
      { href: "/mcp", label: "MCP" },
      { href: "/api-docs", label: "API" },
    ],
  },
  {
    title: "Rechtliches",
    links: [
      { href: "/datenschutz", label: "Datenschutz" },
      { href: "/impressum", label: "Impressum" },
      { href: "/kontakt", label: "Kontakt" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-wash/60">
      <div className="mx-auto grid w-full max-w-5xl gap-x-10 gap-y-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="max-w-sm">
          <p className="inline-flex items-center gap-2.5">
            <SignalMark />
            <span className="font-serif text-lg font-medium tracking-[-0.02em] text-ink">Markenfrei</span>
          </p>
          <p className="mt-3 text-muted">
            Vorprüfung, keine Rechtsberatung, ohne Gewähr (Haftung und Gewährleistung: siehe Impressum). Die Anwendung
            speichert keine Suchanfragen; geprüfte Namen gehen an die abgefragten Dienste (siehe Datenschutz).
          </p>
        </div>
        {GROUPS.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <p className="eyebrow mb-2">{g.title}</p>
            <ul className="space-y-0.5">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={LINK}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
