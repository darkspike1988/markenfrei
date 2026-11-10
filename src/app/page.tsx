import Link from "next/link";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { CheckerFallback, CheckerFromUrl } from "@/components/checker";
import { CodeBlock } from "@/components/code-block";
import { VerdictBadge } from "@/components/status-badge";
import { buildCheckerConfig } from "@/lib/checker-setup";
import type { Namespace } from "@/lib/engine/types";
import type { Verdict } from "@/lib/engine/verdict";
import { GUIDES } from "@/lib/guides";
import { DEFAULT_PUBLIC_URL } from "@/lib/site";
import { webApplicationJsonLd } from "@/lib/structured-data";

const NUMBER = new Intl.NumberFormat("de-DE");

/** Verzögerung für den gestaffelten Einstieg (siehe .rise in globals.css). */
const step = (i: number) => ({ "--i": i }) as CSSProperties;

const VERDICTS: { verdict: Verdict; text: string }[] = [
  { verdict: "green", text: "Alle gewählten Quellen haben geantwortet und kennen den Namen nicht." },
  {
    verdict: "yellow",
    text: "Ähnliche oder schwache Treffer, in einer Quelle nicht zulässig, oder eine Quelle hat nicht geantwortet.",
  },
  { verdict: "red", text: "Mindestens eine Quelle meldet den Namen als vergeben." },
];

const MCP_COMMAND = `claude mcp add --transport http markenfrei ${DEFAULT_PUBLIC_URL}/api/mcp`;

function Arrow() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 transition-transform duration-200 group-hover:translate-x-1"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/** Abschnittskopf der Startseite: Vorzeile, Überschrift und ein Satz dazu. */
function SectionHead({ id, kicker, title, children }: { id: string; kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">{kicker}</p>
      <h2 id={id} className="mt-3 font-serif text-[2rem] leading-[1.08] text-ink sm:text-[2.6rem]">
        {title}
      </h2>
      {children && <div className="mt-4 text-soft sm:text-lg">{children}</div>}
    </div>
  );
}

/** Ein Feld im Raster „Was geprüft wird“: Namensraum, Standardquellen als Plättchen, ein Satz, Link zu den Details. */
function ScopeCell({
  index,
  ns,
  title,
  tags,
  className = "",
  children,
}: {
  index: string;
  ns: Namespace;
  title: string;
  tags: string[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <li className={`card flex flex-col p-5 sm:p-6 ${className}`}>
      <p className="eyebrow">{index}</p>
      <h3 className="mt-2 font-serif text-2xl leading-tight text-ink">{title}</h3>
      {tags.length > 0 && (
        <ul aria-label={`${title}: Standard`} className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <li key={t} className="tag">
              {t}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 flex-1 text-sm text-soft">{children}</p>
      <Link
        href={`/quellen#${ns}`}
        className="group mt-4 inline-flex min-h-6 items-center gap-1.5 self-start text-sm font-medium text-ink underline decoration-line-strong hover:decoration-ink"
      >
        Quellen und Grenzen<span className="sr-only">: {title}</span>
        <Arrow />
      </Link>
    </li>
  );
}

/**
 * Startseite. Die Quellenliste wird hier (Server, Buildzeit) zu reinen Daten gemacht,
 * damit der Engine-Code nicht im Client-Bundle landet. Alle Zahlen und Namen stammen aus dieser Liste.
 */
export default function Home() {
  const config = buildCheckerConfig();
  const of = (ns: Namespace, standard: boolean) =>
    config.sources.filter((s) => s.namespace === ns && s.defaultEnabled === standard).map((s) => s.label);
  const standardCount = config.sources.filter((s) => s.defaultEnabled).length;
  const optionalCount = config.sources.length - standardCount;
  const otherTlds = config.tlds.length - config.featuredTlds.length;
  const morePackages = of("packages", false);

  return (
    <div className="pt-10 sm:pt-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: webApplicationJsonLd() }} />

      <div className="mb-9 grid gap-x-12 gap-y-8 sm:mb-12 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-end">
        <div>
          <p className="eyebrow rise">Namens-Vorprüfung · ohne Konto · ohne KI</p>
          <h1 className="display rise mt-4 text-[2.75rem] text-ink sm:text-7xl lg:text-[5.25rem]" style={step(1)}>
            Wo ist der Name schon{" "}
            <span className="scribble">
              <em>vergeben</em>
              <svg aria-hidden viewBox="0 0 300 20" preserveAspectRatio="none">
                <path
                  d="M4 13c42-8 86-11 132-7 50 4 92 1 160-5"
                  pathLength={1}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </span>
            ?
          </h1>
          <p className="rise mt-6 max-w-xl text-base text-soft sm:text-lg" style={step(2)}>
            Domains, Pakete, App Stores und bekannte Namen in einem Durchgang, mit Link zur Quelle, wo es einen gibt.
          </p>
        </div>

        <aside
          aria-label="Umfang der Prüfung"
          className="rise hidden rotate-[1.4deg] rounded-md border border-line-strong bg-surface px-5 pb-5 pt-4 shadow-[var(--shadow-lift)] lg:block"
          style={step(3)}
        >
          <p className="eyebrow flex items-baseline justify-between border-b border-dashed border-line-strong pb-2">
            <span>Umfang</span>
            <span>Karte 01</span>
          </p>
          <dl className="mt-3 space-y-2 font-mono text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Endungen</dt>
              <dd className="tabular-nums text-ink">{NUMBER.format(config.tlds.length)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">einzeln geprüft</dt>
              <dd className="tabular-nums text-ink">{config.featuredTlds.length}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Quellen, Standard</dt>
              <dd className="tabular-nums text-ink">{standardCount}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Quellen, wählbar</dt>
              <dd className="tabular-nums text-ink">{optionalCount}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Marke</dt>
              <dd className="text-ink">nicht geprüft</dd>
            </div>
          </dl>
          <p className="stamp mt-4 -rotate-3 text-muted">Keine Rechtsberatung</p>
        </aside>
      </div>

      <div className="rise" style={step(3)}>
        <Suspense fallback={<CheckerFallback config={config} />}>
          <CheckerFromUrl config={config} />
        </Suspense>
      </div>

      <section aria-labelledby="umfang" className="mt-24 sm:mt-32">
        <SectionHead id="umfang" kicker="Umfang" title="Was ein Durchgang abfragt">
          <p>
            Jede Quelle liefert genau einen Status. Was nicht antwortet, gilt als unbekannt und nie als frei.
          </p>
        </SectionHead>
        <ul className="mt-8 grid gap-3 md:grid-cols-6">
          <ScopeCell
            index="01"
            ns="domains"
            title="Domains"
            tags={config.defaultTlds.map((t) => `.${t}`)}
            className="md:col-span-4"
          >
            Abfrage per RDAP direkt bei der Registry. {config.featuredTlds.length} Endungen sind einzeln geprüft,{" "}
            {NUMBER.format(otherTlds)} weitere lassen sich über die Suche wählen; dort bleibt „nicht gefunden“ offen.
          </ScopeCell>
          <ScopeCell index="02" ns="stores" title="App Stores" tags={of("stores", true)} className="md:col-span-2">
            Suche nach Apps mit genau diesem Namen. Auf Wunsch: {of("stores", false).join(", ")}.
          </ScopeCell>
          <ScopeCell index="03" ns="packages" title="Pakete" tags={of("packages", true)} className="md:col-span-3">
            Auf Wunsch {morePackages.length} weitere Register, darunter {morePackages.slice(0, 4).join(", ")}.
          </ScopeCell>
          <ScopeCell
            index="04"
            ns="known_names"
            title="Bekannte Namen"
            tags={of("known_names", true)}
            className="md:col-span-3"
          >
            Firmen, Marken und Produkte, die schon so heißen oder ähnlich klingen. Auf Wunsch:{" "}
            {of("known_names", false).join(", ")}.
          </ScopeCell>
          <ScopeCell index="05" ns="social" title="Social" tags={[]} className="md:col-span-2">
            Nur auf Wunsch: {of("social", false).join(", ")}. Für Instagram, TikTok, X und YouTube gibt es Links zum
            Nachsehen von Hand.
          </ScopeCell>
          <li className="flex flex-col rounded-[1.125rem] border border-dashed border-line-strong p-5 sm:p-6 md:col-span-4">
            <p className="eyebrow">06</p>
            <h3 className="mt-2 font-serif text-2xl leading-tight text-ink">Marke: nicht geprüft</h3>
            <p className="mt-4 max-w-xl flex-1 text-sm text-soft">
              Markenregister werden nicht abgefragt. Zu jedem Namen gibt es stattdessen Links zu den Registern, einen
              DPMA-Expertensuchstring, Schreibvarianten, einen Klassenvorschlag und eine Checkliste.
            </p>
            <Link
              href="/markenrecherche-vorbereiten"
              className="group mt-4 inline-flex min-h-6 items-center gap-1.5 self-start text-sm font-medium text-ink underline decoration-line-strong hover:decoration-ink"
            >
              Markenrecherche vorbereiten
              <Arrow />
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="ampel" className="mt-24 grid gap-x-12 gap-y-8 sm:mt-32 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <SectionHead id="ampel" kicker="Ampel" title="Drei Antworten, kein Punktwert">
          <p>
            Die Ampel fasst die Status aller Quellen zusammen. Sie bewertet den Namen nicht und sagt nichts über
            Marken.
          </p>
        </SectionHead>
        <div>
          <dl className="divide-y divide-line border-y border-line">
            {VERDICTS.map((v) => (
              <div key={v.verdict} className="grid gap-x-6 gap-y-2 py-5 sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-center">
                <dt>
                  <VerdictBadge verdict={v.verdict} />
                </dt>
                <dd className="text-soft">{v.text}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-muted">
            „Nicht gefunden“ heißt nicht „registrierbar“.{" "}
            <Link href="/quellen#ampel" className="underline hover:text-ink">
              Mehr zur Ampel
            </Link>
          </p>
        </div>
      </section>

      <nav aria-labelledby="anleitungen" className="mt-24 sm:mt-32">
        <SectionHead id="anleitungen" kicker="Anleitungen" title="Für die genauere Frage" />
        <ul className="mt-8 grid gap-x-12 border-t border-line md:grid-cols-2">
          {GUIDES.map((g) => (
            <li key={g.href} className="border-b border-line">
              <Link href={g.href} className="group flex items-center justify-between gap-6 py-5 no-underline">
                <span>
                  <span className="block font-serif text-xl leading-tight text-ink sm:text-2xl">{g.title}</span>
                  <span className="mt-1 block text-sm text-muted">{g.blurb}</span>
                </span>
                <span className="text-muted transition-colors group-hover:text-ink">
                  <Arrow />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="agenten" className="mt-24 grid gap-x-12 gap-y-8 sm:mt-32 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
        <SectionHead id="agenten" kicker="MCP und API" title="Auch für Agenten und Skripte">
          <p>
            Dieselbe Prüfung als MCP-Server für Coding-Agenten und als HTTP-Schnittstelle, ohne Konto und ohne
            Schlüssel.
          </p>
          <p className="mt-5 flex flex-wrap gap-2 text-base">
            <Link href="/mcp" className="btn btn-primary">
              MCP einrichten
            </Link>
            <Link href="/api-docs" className="btn btn-secondary">
              API-Dokumentation
            </Link>
          </p>
        </SectionHead>
        <CodeBlock label="Claude Code, über HTTP" text={MCP_COMMAND} />
      </section>
    </div>
  );
}
