"use client"; // Error Boundaries müssen Client Components sein

/**
 * Ersetzt das Root-Layout, wenn dieses selbst fehlschlägt. Deshalb ohne globals.css, Schriften,
 * next/link und Layout-Komponenten. Die Farben sind die Tokens aus globals.css (hell/dunkel).
 * Zeigt nie die Fehlermeldung oder einen Stacktrace. Ein <a> statt <Link>: lädt die Seite komplett neu.
 */
const CSS = `
:root{color-scheme:light;--canvas:#fbfbfa;--ink:#1b1b19;--soft:#3a3936;--muted:#5f5e5a;--focus:#1b5f8c;--button:#1b1b19;--button-ink:#ffffff}
@media (prefers-color-scheme: dark){:root{color-scheme:dark;--canvas:#151514;--ink:#ecebe7;--soft:#cfcdc8;--muted:#a19f99;--focus:#92c5ec;--button:#ecebe7;--button-ink:#151514}}
body{margin:0;background:var(--canvas);color:var(--ink);font-family:system-ui,"Helvetica Neue",sans-serif;line-height:1.6}
main{max-width:48rem;margin:0 auto;padding:3.5rem 1rem}
h1{font-family:Georgia,serif;font-weight:400;font-size:2.25rem;line-height:1.1;margin:0 0 1rem}
p{color:var(--soft);margin:0 0 .75rem}
.ref{color:var(--muted);font-size:.875rem}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1.5rem;margin-top:1.5rem}
button{min-height:3rem;padding:0 1.5rem;border:0;border-radius:.5rem;background:var(--button);color:var(--button-ink);font:inherit;font-weight:500;cursor:pointer}
a{color:var(--ink);text-underline-offset:3px}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
`;

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && typeof (error as Error & { digest?: unknown }).digest === "string"
      ? (error as Error & { digest: string }).digest
      : null;

  return (
    <html lang="de">
      <head>
        <title>Etwas ist schiefgelaufen</title>
        <meta name="robots" content="noindex" />
        <style>{CSS}</style>
      </head>
      <body>
        <main>
          <h1>Etwas ist schiefgelaufen</h1>
          <p>Die Seite konnte nicht angezeigt werden. Du kannst es erneut versuchen oder zur Startseite gehen.</p>
          {digest ? <p className="ref">Referenz: {digest}</p> : null}
          <div className="row">
            <button type="button" onClick={() => retry()}>
              Erneut versuchen
            </button>
            {/* Bewusst <a>: Das Root-Layout ist ausgefallen, ein harter Neuladen-Link ist hier der sichere Weg. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Zur Startseite</a>
          </div>
        </main>
      </body>
    </html>
  );
}
