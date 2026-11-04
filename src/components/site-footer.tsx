import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <p className="max-w-md">
          Vorprüfung, keine Rechtsberatung. Die Anwendung speichert keine Suchanfragen; geprüfte Namen gehen an die
          abgefragten Dienste (siehe Datenschutz).
        </p>
        <nav aria-label="Weitere Seiten" className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/quellen" className="inline-flex min-h-6 items-center underline hover:text-ink">
            Quellen
          </Link>
          <Link href="/mcp" className="inline-flex min-h-6 items-center underline hover:text-ink">
            MCP
          </Link>
          <Link href="/datenschutz" className="inline-flex min-h-6 items-center underline hover:text-ink">
            Datenschutz
          </Link>
          <Link href="/impressum" className="inline-flex min-h-6 items-center underline hover:text-ink">
            Impressum
          </Link>
        </nav>
      </div>
    </footer>
  );
}
