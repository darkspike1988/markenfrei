"use client"; // Error Boundaries müssen Client Components sein

import Link from "next/link";

/**
 * Fehlerseite für ein Segment. Zeigt nie die Fehlermeldung oder einen Stacktrace (Informationsabfluss),
 * nur den von Next erzeugten Digest als Referenz für die Server-Logs.
 * Next 16 liefert retry() (lädt neu und rendert neu) und reset(); retry() ist laut Doku der Normalfall.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && typeof (error as Error & { digest?: unknown }).digest === "string"
      ? (error as Error & { digest: string }).digest
      : null;

  return (
    <div className="pt-8 sm:pt-14">
      <h1 className="font-serif text-4xl leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">
        Etwas ist schiefgelaufen
      </h1>
      <div className="mt-4 max-w-2xl space-y-3 text-soft">
        <p>Die Seite konnte nicht angezeigt werden. Du kannst es erneut versuchen oder zur Startseite gehen.</p>
        {digest ? <p className="text-sm text-muted">Referenz: {digest}</p> : null}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex min-h-12 items-center justify-center rounded-lg bg-button px-6 font-medium text-button-ink transition-colors hover:bg-button-hover active:scale-[0.98]"
        >
          Erneut versuchen
        </button>
        <Link href="/" className="underline hover:text-ink">
          Zur Startseite
        </Link>
      </div>
    </div>
  );
}
