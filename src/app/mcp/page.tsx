import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock as Code } from "@/components/code-block";
import { TocInline, TocLayout, type TocItem } from "@/components/page-toc";
import { CHECK_PROFILES, PROFILE_SHARED_IDS, profileSummary } from "@/lib/engine/format";
import { AGENT_INSTRUCTIONS_DE, AGENT_INSTRUCTIONS_EN } from "@/lib/llms-txt";

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
    input: "name, profile?, namespaces?, tlds?, sources?",
    text: "Prüft einen Namen in Domains, Paketregistern, App Stores und bekannten Namen. Liefert Ampel, eine Zeile pro Quelle mit Link und die Markenrecherche-Vorbereitung.",
  },
  {
    name: "markenfrei_check_names",
    input: "names (1 bis 10), sonst wie oben",
    text: "Prüft eine Shortlist und sortiert sie: ohne Treffer in allen gewählten Quellen zuerst, dann wenige Treffer, dann wenige unzulässige Namensräume, dann wenige Lücken. Der Standardweg vor dem Benennen.",
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

const TOC: TocItem[] = [
  { href: "#claude-code", label: "Claude Code" },
  { href: "#claude-desktop", label: "Claude Desktop" },
  { href: "#cursor", label: "Cursor" },
  { href: "#tools", label: "Werkzeuge" },
  { href: "#profile", label: "Profile" },
  { href: "#ablauf", label: "Ablauf für Agenten" },
  { href: "#agents-md", label: "AGENTS.md" },
];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 mt-14 font-serif text-[1.7rem] leading-tight text-ink">
      {children}
    </h2>
  );
}

export default function McpPage() {
  return (
    <TocLayout items={TOC}>
      <h1 className="display text-[2.6rem] text-ink sm:text-6xl">MCP einrichten</h1>
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

      <TocInline items={TOC} />

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

      <section aria-labelledby="profile">
        <H2 id="profile">Profile</H2>
        <p className="mb-3 max-w-2xl text-sm text-soft">
          <code className="font-mono text-[13px]">profile</code> wählt Namensräume, Quellen und Endungen in einem Wort,
          zum Beispiel <code className="font-mono text-[13px]">{`{ "names": ["wachwerk", "fokusnova"], "profile": "npm" }`}</code>.
          Ausdrücklich angegebene <code className="font-mono text-[13px]">namespaces</code>,{" "}
          <code className="font-mono text-[13px]">tlds</code> oder <code className="font-mono text-[13px]">sources</code>{" "}
          ersetzen den jeweiligen Teil. Jedes Profil außer „allgemein“ prüft zusätzlich{" "}
          {PROFILE_SHARED_IDS.join(", ")}. Dasselbe Feld gilt für <code className="font-mono text-[13px]">POST /api/check</code>;
          die Liste steht auch unter <code className="font-mono text-[13px]">GET /api/sources</code>.
        </p>
        <ul className="divide-y divide-line border-y border-line">
          {CHECK_PROFILES.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 py-2.5">
              <span className="font-mono text-sm font-medium text-ink">{p.id}</span>
              <span className="text-sm text-soft">{p.label}</span>
              <span className="font-mono text-xs text-muted">{profileSummary(p)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ablauf">
        <H2 id="ablauf">Ablauf für Agenten</H2>
        <ol className="max-w-2xl list-decimal space-y-1.5 pl-5 text-sm text-soft">
          <li>
            Aufrufen, bevor ein Projekt, Paket, eine App, ein Repository oder eine Domain angelegt oder benannt wird, und
            wenn der Nutzer Namensideen will.
          </li>
          <li>
            5 bis 10 Kandidaten sammeln (eigene Ideen, optional <code className="font-mono text-[13px]">markenfrei_suggest_names</code>)
            und alle zusammen mit <code className="font-mono text-[13px]">markenfrei_check_names</code> und dem passenden
            Profil prüfen.
          </li>
          <li>
            Namen ohne Treffer bevorzugen. Gelb und „unbekannt“ gelten als nicht geklärt; kein Name wird „frei“ genannt.
          </li>
          <li>
            Marken sind nicht geprüft: das sagen und <code className="font-mono text-[13px]">markenfrei_trademark_prep</code>{" "}
            anbieten.
          </li>
          <li>
            Hat der Betreiber einer Instanz einen Registrierungsdienst eingestellt, steht bei Domains mit „nicht
            gefunden“ ein Link „Domain registrieren“. Das ist ein Angebot des Betreibers, an dem er verdienen kann. Der
            Agent zeigt den Link mit Hinweis und bestellt nichts selbst.
          </li>
        </ol>
      </section>

      <section aria-labelledby="agents-md">
        <H2 id="agents-md">Anweisung für AGENTS.md oder CLAUDE.md</H2>
        <p className="mb-3 max-w-2xl text-sm text-soft">
          Diesen Abschnitt in die Anweisungsdatei eines Projekts kopieren, damit der Coding-Agent Namen vor dem Anlegen
          mit Markenfrei prüft. Der MCP-Server muss eingerichtet sein (siehe oben).
        </p>
        <div className="space-y-3">
          <Code label="Deutsch" text={AGENT_INSTRUCTIONS_DE} />
          <Code label="English" text={AGENT_INSTRUCTIONS_EN} />
        </div>
      </section>
    </TocLayout>
  );
}
