import type { Metadata } from "next";
import Link from "next/link";
import { CHECK_ERRORS, CHECK_MAX_BODY_BYTES } from "@/app/api/_lib/check-schema";
import { CodeBlock } from "@/components/code-block";
import { DEFAULT_CACHE_TTL_MS } from "@/lib/cache";
import { DEFAULT_NAMESPACES, MAX_NAMES, MAX_TLDS, STATIC_SOURCES } from "@/lib/engine/check";
import { DEFAULT_DOMAIN_TLDS, DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { NAMESPACE_LABEL, NAMESPACES, type Status } from "@/lib/engine/types";
import { STATUS_LABEL, VERDICT_LABEL, type Verdict } from "@/lib/engine/verdict";
import { EXAMPLE_CHECK_REQUESTS, exampleCheckResponse } from "@/lib/openapi";
import { DEFAULT_RATE_LIMIT, RATE_LIMIT_WINDOW_MS, rateLimitMessage } from "@/lib/rate-limit";
import { DEFAULT_PUBLIC_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "API für Entwickler",
  description:
    "POST /api/check ohne Konto und Schlüssel: Namen in Domains, Paketregistern und App Stores prüfen. Beispiele, Antwortformat, Limits, OpenAPI.",
};

const BASE = DEFAULT_PUBLIC_URL;
const CHECK_URL = `${BASE}/api/check`;
const MINUTES = DEFAULT_CACHE_TTL_MS / 60_000;

const STATUS_MEANING: Record<Status, string> = {
  taken: "Die Quelle kennt den Namen: vergeben.",
  not_found: "Die Quelle kennt den Namen nicht. Das heißt nicht, dass er frei oder registrierbar ist.",
  similar: "Ähnlicher oder nicht eindeutiger Treffer.",
  invalid: "Der Name ist dort nicht zulässig (Syntax oder Länge). Nicht vergeben.",
  unknown: "Keine verwertbare Antwort (Zeitüberschreitung, Fehler, Abfragegrenze). Nie als frei werten.",
};

const VERDICT_MEANING: Record<Verdict, string> = {
  green: "Alle gewählten Quellen kennen den Namen nicht. Keine Freigabe und keine Aussage zur Marke.",
  yellow: "Ähnliche oder schwache Treffer, nicht zulässig oder eine Quelle ohne Antwort: genauer ansehen.",
  red: "Mindestens eine Quelle meldet den Namen als vergeben.",
};

const FIELDS: [string, string][] = [
  ["ranking", "Dieselben Namen als Rangliste: zuerst Namen ohne Treffer in allen gewählten Quellen, dann wenige Treffer, dann wenige unzulässige Namensräume, dann wenige Lücken. Enthält je Name verdict, freeInAll und die Quellen mit taken, invalid und unknown."],
  ["reports", "Ein Bericht je verschiedenem Namen (nach der Normalisierung) in Eingabereihenfolge."],
  ["reports[].verdict", "Ampel aus den Status aller Quellen: green, yellow oder red."],
  ["reports[].counts", "Anzahl der Quellen je Status."],
  ["reports[].incomplete", "Namen der Quellen ohne verwertbare Antwort. Dort heißt „nichts gefunden“ nicht „frei“."],
  ["reports[].results[]", "Eine Zeile je Quelle: sourceId, namespace, label, target, status und, wo vorhanden, url zum Nachprüfen, note, evidence, weak (schwaches Signal, höchstens Gelb) und retryable (bei unknown: später erneut versuchen lohnt sich)."],
  ["reports[].trademark", "Vorbereitung der Markenrecherche: Registerlinks, DPMA-Expertensuchstring, Schreibvarianten, Klassenvorschlag, Checkliste. status ist immer not_checked: Marken werden nicht abgefragt."],
  ["reports[].manualLinks", "Links zum Nachsehen von Hand (Instagram, TikTok, X, YouTube, Chrome Web Store). Hier wird nichts abgefragt."],
];

const ERRORS: [number, string, string][] = [
  [400, "Kaputtes JSON, falsche Typen, keine oder zu viele Namen, ungültiger Name, unbekannte Endung, Quelle oder Namensraum", `z. B. „Höchstens ${MAX_NAMES} Namen pro Anfrage.“`],
  [403, "Aufruf aus einer fremden Browserseite (Origin nicht erlaubt)", CHECK_ERRORS.forbidden],
  [413, `Body größer als ${CHECK_MAX_BODY_BYTES / 1024} KB`, CHECK_ERRORS.tooLarge],
  [415, "Content-Type ist nicht application/json", CHECK_ERRORS.contentType],
  [429, "Rate-Limit erreicht; Retry-After nennt die Sekunden", rateLimitMessage(12)],
  [500, "Unerwarteter Fehler", CHECK_ERRORS.failed],
];

const bodyJson = (body: object) => JSON.stringify(body);

const CURL_SINGLE = `curl -s ${CHECK_URL} \\
  -H "Content-Type: application/json" \\
  -d '${bodyJson(EXAMPLE_CHECK_REQUESTS.single)}'`;

const CURL_SHORTLIST = `curl -s ${CHECK_URL} \\
  -H "Content-Type: application/json" \\
  -d '${bodyJson(EXAMPLE_CHECK_REQUESTS.shortlist)}' \\
  | jq '.ranking'`;

const CURL_SELECTION = `curl -s ${CHECK_URL} \\
  -H "Content-Type: application/json" \\
  -d '${bodyJson(EXAMPLE_CHECK_REQUESTS.selection)}'`;

const JS_EXAMPLE = `const res = await fetch("${CHECK_URL}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(${bodyJson(EXAMPLE_CHECK_REQUESTS.shortlist)}),
});
const data = await res.json();
if (!res.ok) throw new Error(data.error); // 4xx und 5xx: { error: "..." }

for (const entry of data.ranking) {
  // "green" heißt nur: in den gewählten Quellen nichts gefunden
  console.log(entry.name, entry.verdict, "vergeben:", entry.taken, "unbekannt:", entry.unknown);
}`;

const PY_EXAMPLE = `import requests

res = requests.post(
    "${CHECK_URL}",
    json=${bodyJson(EXAMPLE_CHECK_REQUESTS.shortlist)},
    timeout=20,
)
data = res.json()
if not res.ok:
    # 429: Retry-After nennt die Wartezeit in Sekunden
    raise SystemExit(data["error"])

for entry in data["ranking"]:
    # "green" heißt nur: in den gewählten Quellen nichts gefunden
    print(entry["name"], entry["verdict"], "vergeben:", entry["taken"], "unbekannt:", entry["unknown"])`;

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 mt-12 font-serif text-2xl tracking-tight text-ink">
      {children}
    </h2>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[13px] text-ink">{children}</code>;
}

export default function ApiDocsPage() {
  const example = JSON.stringify(exampleCheckResponse(), null, 2);
  const defaultSources = STATIC_SOURCES.filter((s) => s.defaultEnabled);
  const optionalSources = STATIC_SOURCES.filter((s) => !s.defaultEnabled);

  return (
    <div className="pt-8 sm:pt-14">
      <h1 className="font-serif text-4xl leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">API für Entwickler</h1>
      <div className="mt-4 max-w-2xl space-y-3 text-soft">
        <p>
          Dieselbe Prüfung wie auf der Webseite, als JSON-Schnittstelle: ohne Konto, ohne Schlüssel, ohne LLM. Du
          schickst einen Namen oder eine Shortlist und bekommst je Name eine Zeile pro Quelle, eine Ampel und die
          Vorbereitung für die Markenrecherche. Suchanfragen werden nicht gespeichert.
        </p>
        <p>
          <span className="font-medium text-ink">Grün heißt nicht „frei“.</span> „Nicht gefunden“ heißt nur, dass die
          Quelle den Namen nicht kennt. „Unbekannt“ ist nie frei. Die Marke wird nicht geprüft; dafür liefert die
          Antwort Links und eine Checkliste. Vorprüfung, keine Rechtsberatung.
        </p>
      </div>

      <nav aria-label="Abschnitte" className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href="#ueberblick" className="underline">Überblick</a>
        <a href="#grenzen" className="underline">Grenzen</a>
        <a href="#beispiele" className="underline">Beispiele</a>
        <a href="#antwort" className="underline">Antwort</a>
        <a href="#werte" className="underline">Werte</a>
        <a href="#fehler" className="underline">Fehler</a>
        <a href="#agenten" className="underline">Maschinenlesbar</a>
      </nav>

      <section aria-labelledby="ueberblick">
        <H2 id="ueberblick">Überblick</H2>
        <div className="border-y border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Öffentliche Endpunkte</caption>
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">Endpunkt</th>
                <th scope="col" className="py-2 font-medium">Zweck</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <td className="py-2 pr-4 align-top font-mono text-[13px] text-ink">POST /api/check</td>
                <td className="py-2 text-soft">Einen Namen oder bis zu {MAX_NAMES} Namen prüfen</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 align-top font-mono text-[13px] text-ink">POST /api/mcp</td>
                <td className="py-2 text-soft">
                  MCP über Streamable HTTP für Agenten, siehe{" "}
                  <Link href="/mcp" className="underline hover:text-ink">MCP einrichten</Link>
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 align-top font-mono text-[13px] text-ink">GET /api/sources</td>
                <td className="py-2 text-soft">
                  Alle Quellen-IDs, Namensräume und Endungen als JSON, mit Kennzeichnung der Standardauswahl (die
                  gültigen Werte für <Mono>sources</Mono>, <Mono>namespaces</Mono> und <Mono>tlds</Mono>)
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 align-top font-mono text-[13px] text-ink">GET /api/health</td>
                <td className="py-2 text-soft">Lebenszeichen für Monitoring: <Mono>{`{ "status": "ok", "version": "…" }`}</Mono></td>
              </tr>
              <tr>
                <td className="py-2 pr-4 align-top font-mono text-[13px] text-ink">GET /api/openapi.json</td>
                <td className="py-2 text-soft">OpenAPI-3.1-Beschreibung dieser Schnittstelle</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Die Beispiele zeigen <Mono>{BASE}</Mono>. Bei einer selbst betriebenen Instanz setzt du deren Adresse ein.
          Aufrufe aus Browserseiten fremder Herkunft werden abgelehnt (403, kein CORS); curl, Skripte und Server ohne
          Origin-Header funktionieren.
        </p>
      </section>

      <section aria-labelledby="grenzen">
        <H2 id="grenzen">Grenzen und faire Nutzung</H2>
        <ul className="max-w-2xl list-disc space-y-2 pl-5 text-sm text-soft">
          <li>
            Gedacht für Einzelabfragen, die ein Mensch oder dein Werkzeug für ein konkretes Projekt auslöst, nicht für
            Massenabfragen oder das Abgrasen von Namenslisten. Jede Prüfung fragt offene Dienste Dritter ab; deren
            Grenzen schützen wir mit.
          </li>
          <li>
            Höchstens {MAX_NAMES} Namen pro Anfrage, Body höchstens {CHECK_MAX_BODY_BYTES / 1024} KB, höchstens{" "}
            {MAX_TLDS} verschiedene Endungen, Content-Type <Mono>application/json</Mono>.
          </li>
          <li>
            Rate-Limit pro IP: standardmäßig {DEFAULT_RATE_LIMIT} Einheiten pro {RATE_LIMIT_WINDOW_MS / 1000} Sekunden.
            Jeder verschiedene Name zählt eine Einheit; eine größere Quellenauswahl kostet ein Vielfaches. Danach
            antwortet der Server mit 429 und <Mono>Retry-After</Mono>. Jede Antwort von <Mono>/api/check</Mono> und{" "}
            <Mono>/api/mcp</Mono> nennt den Stand in <Mono>RateLimit-Limit</Mono>, <Mono>RateLimit-Remaining</Mono> und{" "}
            <Mono>RateLimit-Reset</Mono> (Sekunden bis zum Ende des Fensters), so kann ein Client sein Tempo selbst anpassen. Betreiber einer eigenen Instanz können den Wert
            ändern. Zusätzlich gibt es ein Limit pro Serverprozess, das die abgefragten Dienste schützt.
          </li>
          <li>
            Eindeutige Antworten der Quellen hält der Server {MINUTES} Minuten im Arbeitsspeicher. Dieselbe Prüfung
            innerhalb dieser Zeit liefert dieselben Ergebnisse und belastet die Dienste nicht erneut. Quellen ohne
            Antwort (<Mono>unknown</Mono>) werden nicht gemerkt; bei <Mono>retryable: true</Mono> lohnt sich ein
            neuer Versuch nach einigen Sekunden.
          </li>
          <li>
            Eine Prüfung dauert höchstens etwa 8 Sekunden. Setze im Client ein Timeout von 15 bis 20 Sekunden.
          </li>
          <li>
            <Mono>unknown</Mono> ist keine Antwort „frei“. Wer Ergebnisse automatisch auswertet, sollte{" "}
            <Mono>incomplete</Mono> und <Mono>unknown</Mono> als offen behandeln.
          </li>
        </ul>
      </section>

      <section aria-labelledby="beispiele">
        <H2 id="beispiele">Beispiele</H2>
        <p className="mb-4 max-w-2xl text-sm text-soft">
          Eingabe: <Mono>names</Mono> (Pflicht, 1 bis {MAX_NAMES}), optional <Mono>tlds</Mono>,{" "}
          <Mono>namespaces</Mono> und <Mono>sources</Mono>. Ohne Angabe gelten die Standardwerte (siehe{" "}
          <a href="#werte" className="underline hover:text-ink">Werte</a>).
        </p>
        <div className="space-y-3">
          <CodeBlock label="curl: ein Name mit Standardauswahl" text={CURL_SINGLE} />
          <CodeBlock label="curl: Shortlist, nur die Rangliste anzeigen (jq)" text={CURL_SHORTLIST} />
          <CodeBlock label="curl: Endungen, Namensräume und Quellen wählen" text={CURL_SELECTION} />
        </div>
        <p className="mb-4 mt-3 max-w-2xl text-sm text-muted">
          <Mono>sources</Mono> ersetzt die Standardquellen außerhalb von Domains: Wer Zusatzquellen will, schickt die
          gewünschten Standardquellen mit. Domains kommen weiter aus <Mono>tlds</Mono> und <Mono>namespaces</Mono>.
          Im Namensraum <Mono>social</Mono> ist keine Quelle Standard, dort wählst du über <Mono>sources</Mono>.
        </p>
        <div className="space-y-3">
          <CodeBlock label="JavaScript (fetch, Node 18 oder neuer)" text={JS_EXAMPLE} />
          <CodeBlock label="Python (requests)" text={PY_EXAMPLE} />
        </div>
      </section>

      <section aria-labelledby="antwort">
        <H2 id="antwort">Antwort</H2>
        <p className="mb-4 max-w-2xl text-sm text-soft">
          Die Antwort ist ein Objekt mit <Mono>ranking</Mono> und <Mono>reports</Mono>, mit{" "}
          <Mono>Cache-Control: no-store</Mono>. Das Format ist ein Vertrag (<Mono>schemaVersion: 2</Mono>) und in{" "}
          <a href="#agenten" className="underline hover:text-ink">OpenAPI</a> vollständig beschrieben.
        </p>
        <dl className="max-w-2xl divide-y divide-line border-y border-line text-sm">
          {FIELDS.map(([name, text]) => (
            <div key={name} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
              <dt className="font-mono text-[13px] text-ink sm:w-44 sm:shrink-0">{name}</dt>
              <dd className="text-soft">{text}</dd>
            </div>
          ))}
        </dl>

        <h3 className="mb-2 mt-8 font-medium text-ink">Status je Quelle</h3>
        <dl className="max-w-2xl divide-y divide-line border-y border-line text-sm">
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <div key={s} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
              <dt className="font-mono text-[13px] text-ink sm:w-44 sm:shrink-0">
                {s} <span className="font-sans text-muted">({STATUS_LABEL[s]})</span>
              </dt>
              <dd className="text-soft">{STATUS_MEANING[s]}</dd>
            </div>
          ))}
        </dl>

        <h3 className="mb-2 mt-8 font-medium text-ink">Ampel</h3>
        <dl className="max-w-2xl divide-y divide-line border-y border-line text-sm">
          {(Object.keys(VERDICT_LABEL) as Verdict[]).map((v) => (
            <div key={v} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
              <dt className="font-mono text-[13px] text-ink sm:w-44 sm:shrink-0">
                {v} <span className="font-sans text-muted">({VERDICT_LABEL[v]})</span>
              </dt>
              <dd className="text-soft">{VERDICT_MEANING[v]}</dd>
            </div>
          ))}
        </dl>

        <details className="mt-8 rounded-lg border border-line bg-surface">
          <summary className="flex min-h-6 cursor-pointer items-center px-3 py-2 text-sm text-ink">
            Beispielantwort für <Mono>{`{"names":["wachwerk"]}`}</Mono> (gekürzt, Werte ausgedacht)
          </summary>
          <pre className="overflow-x-auto border-t border-line px-3 py-3 font-mono text-[13px] leading-relaxed text-ink">
            <code>{example}</code>
          </pre>
        </details>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Gekürzt: Die echte Antwort enthält je Name eine Zeile für jede gewählte Quelle, alle Registerlinks und die
          vollständige Checkliste. Die Werte im Beispiel sind ausgedacht, kein Prüfergebnis. Im Beispiel ist die Ampel
          gelb, weil eine Quelle nicht geantwortet hat; auch bei grün wäre der Name nicht als frei oder als Marke
          freigegeben zu verstehen.
        </p>
      </section>

      <section aria-labelledby="werte">
        <H2 id="werte">Erlaubte Werte</H2>
        <dl className="max-w-2xl space-y-4 text-sm">
          <div>
            <dt className="font-medium text-ink">namespaces</dt>
            <dd className="mt-1 text-soft">
              {NAMESPACES.map((n) => (
                <span key={n} className="mr-2 inline-block whitespace-nowrap">
                  <Mono>{n}</Mono> ({NAMESPACE_LABEL[n]}
                  {DEFAULT_NAMESPACES.includes(n) ? ", Standard" : ""})
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink">tlds</dt>
            <dd className="mt-1 text-soft">
              Höchstens {MAX_TLDS} verschiedene. Standard: <Mono>{DEFAULT_DOMAIN_TLDS.join(", ")}</Mono>. Erlaubt:{" "}
              <Mono>{DOMAIN_TLDS.join(", ")}</Mono>. Verfahren je Endung stehen unter{" "}
              <Link href="/quellen#domains" className="underline hover:text-ink">Quellen</Link>.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink">sources, Standardauswahl</dt>
            <dd className="mt-1 text-soft">
              <Mono>{defaultSources.map((s) => s.id).join(", ")}</Mono>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink">sources, auf Wunsch</dt>
            <dd className="mt-1 text-soft">
              <Mono>{optionalSources.map((s) => s.id).join(", ")}</Mono>
            </dd>
          </div>
        </dl>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Was hinter jeder Quelle steckt, steht unter{" "}
          <Link href="/quellen" className="underline hover:text-ink">Quellen</Link>. Unbekannte Werte lehnt die
          Schnittstelle mit 400 ab.
        </p>
      </section>

      <section aria-labelledby="fehler">
        <H2 id="fehler">Fehler</H2>
        <p className="mb-4 max-w-2xl text-sm text-soft">
          Fehler kommen als <Mono>{`{ "error": "<deutsche Meldung>" }`}</Mono> mit passendem Status. Die Meldung nennt
          den Grund und enthält nie interne Details.
        </p>
        <div className="border-y border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Fehlerantworten von POST /api/check</caption>
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                <th scope="col" className="py-2 pr-4 font-medium">Fall</th>
                <th scope="col" className="py-2 font-medium">Meldung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ERRORS.map(([status, when, message]) => (
                <tr key={status}>
                  <td className="py-2 pr-4 align-top font-mono text-[13px] text-ink">{status}</td>
                  <td className="py-2 pr-4 align-top text-soft">{when}</td>
                  <td className="py-2 align-top text-soft">{message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="agenten">
        <H2 id="agenten">Maschinenlesbar und für Agenten</H2>
        <ul className="max-w-2xl list-disc space-y-2 pl-5 text-sm text-soft">
          <li>
            <a href="/api/openapi.json" className="underline hover:text-ink">/api/openapi.json</a>: OpenAPI 3.1 mit
            allen Schemas, Grenzen und Fehlerantworten, erzeugt aus demselben Code wie die Schnittstelle.
          </li>
          <li>
            <Link href="/mcp" className="underline hover:text-ink">/mcp</Link>: Einrichtung des MCP-Servers für
            Coding-Agenten (<Mono>POST /api/mcp</Mono>), mit denselben Regeln: <Mono>not_found</Mono> und{" "}
            <Mono>unknown</Mono> sind nie frei, die Marke bleibt „nicht geprüft“.
          </li>
          <li>
            Quellcode und Issues auf{" "}
            <a href="https://github.com/darkspike1988/markenfrei" className="underline hover:text-ink">GitHub</a> (MIT).
          </li>
        </ul>
      </section>
    </div>
  );
}
