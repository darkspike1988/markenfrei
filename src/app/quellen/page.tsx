import type { Metadata } from "next";
import Link from "next/link";
import { STATIC_SOURCES } from "@/lib/engine/check";
import { DEFAULT_DOMAIN_TLDS, DOH_ONLY_TLDS, DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { TRADEMARK_LINKS_CHECKED, trademarkPrep } from "@/lib/engine/trademark-prep";
import { NAMESPACE_LABEL, NAMESPACES } from "@/lib/engine/types";

export const metadata: Metadata = {
  title: "Quellen",
  description: "Alle Quellen, die Markenfrei abfragt, mit Endpunkt, Signal und Grenzen, sowie die Links zur Markenrecherche.",
};

/**
 * Endungen mit festem RDAP-Server, weil der IANA-Bootstrap sie nicht enthält.
 * Entspricht RDAP_OVERRIDES in src/lib/engine/sources/domains.ts (dort nicht exportiert).
 */
const RDAP_OVERRIDE_TLDS = ["de", "io", "ch", "li"];

function tldMethod(t: string): string {
  if (DOH_ONLY_TLDS.includes(t)) return "nur DNS (höchstens „vergeben“)";
  if (RDAP_OVERRIDE_TLDS.includes(t)) return "RDAP, fester Server (Override)";
  return "RDAP über IANA-Bootstrap";
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 mt-12 font-serif text-2xl tracking-tight text-ink">
      {children}
    </h2>
  );
}

export default function QuellenPage() {
  const tm = trademarkPrep("beispiel").links;
  const groups = NAMESPACES.map((ns) => ({ ns, list: STATIC_SOURCES.filter((s) => s.namespace === ns) })).filter(
    (g) => g.list.length > 0,
  );
  const checked = new Date(TRADEMARK_LINKS_CHECKED).toLocaleDateString("de-DE", { dateStyle: "long" });

  return (
    <div className="pt-8 sm:pt-14">
      <h1 className="font-serif text-4xl leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">Quellen</h1>
      <div className="mt-4 max-w-2xl space-y-3 text-soft">
        <p>
          Jede Quelle liefert genau einen Status: vergeben, nicht gefunden, ähnlich, nicht zulässig oder unbekannt.
          „Nicht gefunden“ heißt, die Quelle kennt den Namen nicht, nicht dass er registrierbar ist. „Unbekannt“
          (Zeitüberschreitung, Fehler, Rate-Limit) wird nie als frei gewertet.
        </p>
        <p>
          Abgefragt wird nur, was du auslöst: eine Einzelabfrage pro Quelle, ohne Schlüssel, ohne Umgehung von
          Bot-Abwehr. Eindeutige Antworten hält der Server 10 Minuten im Arbeitsspeicher, damit wiederholte Prüfungen
          die Dienste nicht erneut belasten. Für Dienste mit dokumentierter Grenze (Apple: etwa 20 Anfragen pro Minute,
          crates.io: eine pro Sekunde) gilt ein Abfragebudget; ist es erschöpft, meldet die Quelle „unbekannt“ und
          sendet nichts. Die Anwendung protokolliert keine Suchanfragen und speichert sie nicht dauerhaft; Server-Logs des Hostings sind in der Datenschutzerklärung beschrieben.
        </p>
      </div>

      <nav aria-label="Abschnitte" className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href="#domains" className="underline">
          Domains
        </a>
        {groups.map((g) => (
          <a key={g.ns} href={`#${g.ns}`} className="underline">
            {NAMESPACE_LABEL[g.ns]}
          </a>
        ))}
        <a href="#marke" className="underline">
          Marke
        </a>
      </nav>

      <section aria-labelledby="domains">
        <H2 id="domains">Domains</H2>
        <p className="mb-4 max-w-2xl text-sm text-soft">
          Signal ist nur der HTTP-Status des RDAP-Servers der Registry (200 vergeben, 404 dort nicht registriert).
          Den Server liefert der IANA-RDAP-Bootstrap; für Endungen, die dort fehlen, gibt es feste Overrides. DNS über
          HTTPS bestätigt nur „vergeben“ und ist nie ein Beleg für „frei“. Premium- und reservierte Domains erkennt
          RDAP nicht.
        </p>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-wash text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Endung
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Verfahren
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Standard
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {DOMAIN_TLDS.map((t) => (
                <tr key={t}>
                  <td className="px-4 py-2 font-mono text-ink">.{t}</td>
                  <td className="px-4 py-2 text-soft">{tldMethod(t)}</td>
                  <td className="px-4 py-2 text-soft">{DEFAULT_DOMAIN_TLDS.includes(t) ? "ja" : "nein"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {groups.map((g) => (
        <section key={g.ns} aria-labelledby={g.ns}>
          <H2 id={g.ns}>{NAMESPACE_LABEL[g.ns]}</H2>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {g.list.map((s) => (
              <li key={s.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="font-medium text-ink">{s.label}</h3>
                  <span
                    className={`rounded px-1.5 py-px text-xs ${
                      s.defaultEnabled ? "bg-ok-bg text-ok" : "border border-line text-muted"
                    }`}
                  >
                    {s.defaultEnabled ? "Standard: ja" : "Standard: nein, wählbar"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-soft">{s.description}</p>
                <p className="mt-1.5 font-mono text-[13px] text-muted">{s.endpoint}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="marke">
        <H2 id="marke">Marke: nicht geprüft</H2>
        <p className="mb-4 max-w-2xl text-sm text-soft">
          Markenregister werden nicht abgefragt. Zu jedem Namen gibt es stattdessen Links zur manuellen Suche, einen
          DPMA-Expertensuchstring, Schreibvarianten, einen Klassenvorschlag und eine Checkliste. Links zuletzt geprüft
          am {checked}; „beispiel“ steht hier für den geprüften Namen.
        </p>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {tm.map((l) => (
            <li key={l.label} className="px-4 py-3.5 sm:px-5">
              <h3 className="font-medium text-ink">
                {l.label} <span className="font-normal text-muted">({l.office})</span>
              </h3>
              <p className="mt-1 text-sm text-soft">{l.what}</p>
              <p className="mt-1.5 font-mono text-[13px] text-muted">{l.url}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-12 text-sm text-muted">
        Für Agenten gibt es dieselben Quellen über MCP:{" "}
        <Link href="/mcp" className="underline hover:text-ink">
          Einrichtung
        </Link>
        .
      </p>
    </div>
  );
}
