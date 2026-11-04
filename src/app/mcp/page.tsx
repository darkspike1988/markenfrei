import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";

export const metadata: Metadata = {
  title: "MCP einrichten",
  description:
    "Markenfrei als MCP-Server in Claude Code, Claude Desktop und Cursor einrichten: Namen deterministisch prüfen, Markenrecherche vorbereiten.",
};

const HTTP_URL = "https://markenfrei.app/api/mcp";

const SNIPPETS = {
  claudeStdio: "claude mcp add markenfrei -- npx -y markenfrei-mcp",
  claudeHttp: `claude mcp add --transport http markenfrei ${HTTP_URL}`,
  claudeLocal: "claude mcp add markenfrei -- node /pfad/zu/markenfrei/mcp/dist/markenfrei-mcp.mjs",
  desktop: JSON.stringify(
    { mcpServers: { markenfrei: { command: "npx", args: ["-y", "markenfrei-mcp"] } } },
    null,
    2,
  ),
  cursorStdio: JSON.stringify(
    { mcpServers: { markenfrei: { command: "npx", args: ["-y", "markenfrei-mcp"] } } },
    null,
    2,
  ),
  cursorHttp: JSON.stringify({ mcpServers: { markenfrei: { url: HTTP_URL } } }, null, 2),
};

const TOOLS: { name: string; input: string; text: string }[] = [
  {
    name: "markenfrei_check_name",
    input: "name, namespaces?, tlds?, sources?",
    text: "Prüft einen Namen in Domains, Paketregistern, App Stores und bekannten Namen. Liefert Ampel, eine Zeile pro Quelle mit Link und die Markenrecherche-Vorbereitung.",
  },
  {
    name: "markenfrei_check_names",
    input: "names (1 bis 10), sonst wie oben",
    text: "Prüft eine Shortlist und sortiert sie: frei in allen gewählten Quellen zuerst, dann wenige Treffer, dann wenige Lücken.",
  },
  {
    name: "markenfrei_trademark_prep",
    input: "name, classes?",
    text: "Ohne Netzabfrage: Links zu DPMA, TMview, EUIPO, WIPO und weiteren Registern, DPMA-Expertensuchstring, Schreibvarianten, Klassen und Checkliste.",
  },
  {
    name: "markenfrei_suggest_names",
    input: "keywords",
    text: "Regelbasierte Kandidaten aus dem Wortfeld der Stichwörter, ungeprüft, zum Weiterreichen an check_names.",
  },
];

function Code({ text, label }: { text: string; label: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-wash px-3 py-1.5">
        <span className="text-xs text-muted">{label}</span>
        <CopyButton text={text} />
      </div>
      <pre className="overflow-x-auto px-3 py-3 font-mono text-[13px] leading-relaxed text-ink">
        <code>{text}</code>
      </pre>
    </div>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 mt-12 font-serif text-2xl tracking-tight text-ink">
      {children}
    </h2>
  );
}

export default function McpPage() {
  return (
    <div className="pt-8 sm:pt-14">
      <h1 className="font-serif text-4xl leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">MCP einrichten</h1>
      <p className="mt-4 max-w-2xl text-soft">
        Ein Coding-Agent kann vor dem Anlegen eines Projekts oder Pakets prüfen, ob der Name in den benötigten
        Namensräumen frei ist. Beim Benennen erzeugt das Sprachmodell deines Clients die Kandidaten, Markenfrei prüft
        sie deterministisch. Grün heißt nicht markenrechtlich frei; „unbekannt“ ist nie frei.
      </p>

      <div className="mt-6 rounded-lg border border-line bg-warn-bg px-4 py-3 text-sm text-warn">
        Das npm-Paket <code className="font-mono">markenfrei-mcp</code> muss erst vom Betreiber veröffentlicht werden.
        Bis dahin funktioniert <code className="font-mono">npx</code> nicht; starte den Server lokal aus dem
        Repository mit <code className="font-mono">node mcp/dist/markenfrei-mcp.mjs</code> oder nutze die HTTP-Variante.
      </div>

      <section aria-labelledby="claude-code">
        <H2 id="claude-code">Claude Code</H2>
        <div className="space-y-3">
          <Code label="Lokal über npx (stdio)" text={SNIPPETS.claudeStdio} />
          <Code label="Über HTTP" text={SNIPPETS.claudeHttp} />
          <Code label="Lokal aus dem Repository, bis das Paket veröffentlicht ist" text={SNIPPETS.claudeLocal} />
        </div>
      </section>

      <section aria-labelledby="claude-desktop">
        <H2 id="claude-desktop">Claude Desktop</H2>
        <p className="mb-3 text-sm text-soft">
          In <span className="font-medium">Einstellungen → Entwickler → Konfiguration bearbeiten</span> in{" "}
          <code className="font-mono text-[13px]">claude_desktop_config.json</code> eintragen und Claude Desktop neu
          starten.
        </p>
        <Code label="claude_desktop_config.json" text={SNIPPETS.desktop} />
      </section>

      <section aria-labelledby="cursor">
        <H2 id="cursor">Cursor</H2>
        <p className="mb-3 text-sm text-soft">
          In <code className="font-mono text-[13px]">~/.cursor/mcp.json</code> (global) oder{" "}
          <code className="font-mono text-[13px]">.cursor/mcp.json</code> im Projekt eintragen.
        </p>
        <div className="space-y-3">
          <Code label="Lokal über npx" text={SNIPPETS.cursorStdio} />
          <Code label="Über HTTP" text={SNIPPETS.cursorHttp} />
        </div>
      </section>

      <section aria-labelledby="tools">
        <H2 id="tools">Werkzeuge</H2>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {TOOLS.map((t) => (
            <li key={t.name} className="px-4 py-3.5 sm:px-5">
              <h3 className="font-mono text-sm font-medium text-ink">{t.name}</h3>
              <p className="mt-0.5 font-mono text-xs text-muted">{t.input}</p>
              <p className="mt-1.5 text-sm text-soft">{t.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          Es gelten dieselben Quellen und Regeln wie auf der Webseite, siehe{" "}
          <Link href="/quellen" className="underline hover:text-ink">
            Quellen
          </Link>
          . Die HTTP-Variante lehnt JSON-RPC-Batches ab und ist pro IP begrenzt.
        </p>
      </section>
    </div>
  );
}
