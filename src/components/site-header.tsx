import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
      <Link href="/" className="font-serif text-xl tracking-tight text-ink no-underline">
        Markenfrei
      </Link>
      <nav aria-label="Hauptnavigation" className="flex items-center gap-1 text-sm">
        <Link href="/quellen" className="inline-flex min-h-8 items-center rounded px-2 text-soft hover:text-ink">
          Quellen
        </Link>
        <Link href="/mcp" className="inline-flex min-h-8 items-center rounded px-2 text-soft hover:text-ink">
          MCP
        </Link>
      </nav>
    </header>
  );
}
