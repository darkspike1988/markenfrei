import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock as Code } from "@/components/code-block";

export const metadata: Metadata = {
  title: "MCP einrichten",
  description:
    "Markenfrei als MCP-Server in Claude Code, Claude Desktop und Cursor einrichten: Namen deterministisch prüfen, Markenrecherche vorbereiten.",
};

const HTTP_URL = "https://markenfrei.app/api/mcp";
const LOCAL_PATH = "/pfad/zu/markenfrei/mcp/dist/markenfrei-mcp.mjs";

const SNIPPETS = {
  claudeHttp: `claude mcp add --transport http markenfrei ${HTTP_URL}`,
  claudeLocal: `claude mcp add markenfrei -- node ${LOCAL_PATH}`,
  desktop: JSON.stringify({ mcpServers: { markenfrei: { command: "node", args: [LOCAL_PATH] } } }, null, 2),
  cursorHttp: JSON.stringify({ mcpServers: { markenfrei: { url: HTTP_URL } } }, null, 2),
  cursorLocal: JSON.stringify({ mcpServers: { markenfrei: { command: "node", args: [LOCAL_PATH] } } }, null, 2),
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
    text: "Prüft eine Shortlist und sortiert sie: ohne Treffer in allen gewählten Quellen zuerst, dann wenige Treffer, dann wenige unzulässige Namensräume, dann wenige Lücken.",
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
        Ein Coding-Agent kann vor dem Anlegen eines Projekts oder Pakets prüfen, wo der Name in den benötigten
        Namensräumen schon vergeben ist. Beim Benennen erzeugt das Sprachmodell deines Clients die Kandidaten,
        Markenfrei prüft sie deterministisch. Grün heißt nicht markenrechtlich frei; „unbekannt“ ist nie frei.
      </p>
      <p className="mt-3 max-w-2xl text-sm text-muted">
        Zwei Wege: über HTTP direkt von <code className="font-mono">{HTTP_URL}</code>, oder lokal aus dem Repository
        (<code className="font-mono">npm run build:mcp</code>, danach{" "}
        <code className="font-mono">node mcp/dist/markenfrei-mcp.mjs</code>). Jede selbst betriebene Instanz bietet
        die HTTP-Adresse unter <code className="font-mono">/api/mcp</code>.
      </p>

      <section aria-labelledby="claude-code">
        <H2 id="claude-code">Claude Code</H2>
        <div className="space-y-3">
          <Code label="Über HTTP" text={SNIPPETS.claudeHttp} />
          <Code label="Lokal aus dem Repository" text={SNIPPETS.claudeLocal} />
        </div>
      </section>

      <section aria-labelledby="claude-desktop">
        <H2 id="claude-desktop">Claude Desktop</H2>
        <p className="mb-3 text-sm text-soft">
          In <span className="font-medium">Einstellungen → Entwickler → Konfiguration bearbeiten</span> in{" "}
          <code className="font-mono text-[13px]">claude_desktop_config.json</code> eintragen und Claude Desktop neu
          starten.
        </p>
        <Code label="claude_desktop_config.json, lokal aus dem Repository" text={SNIPPETS.desktop} />
      </section>

      <section aria-labelledby="cursor">
        <H2 id="cursor">Cursor</H2>
        <p className="mb-3 text-sm text-soft">
          In <code className="font-mono text-[13px]">~/.cursor/mcp.json</code> (global) oder{" "}
          <code className="font-mono text-[13px]">.cursor/mcp.json</code> im Projekt eintragen.
        </p>
        <div className="space-y-3">
          <Code label="Über HTTP" text={SNIPPETS.cursorHttp} />
          <Code label="Lokal aus dem Repository" text={SNIPPETS.cursorLocal} />
        </div>
      </section>

      <section aria-labelledby="tools">
        <H2 id="tools">Werkzeuge</H2>
        <ul className="divide-y divide-line border-y border-line">
          {TOOLS.map((t) => (
            <li key={t.name} className="py-3.5">
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
        <p className="mt-2 text-sm text-muted">
          Für eigene Skripte ohne MCP gibt es die REST-Schnittstelle:{" "}
          <Link href="/api-docs" className="underline hover:text-ink">
            API-Dokumentation
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
