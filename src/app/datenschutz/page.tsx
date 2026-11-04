import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MissingOperatorNotice, WithOperator } from "@/components/operator-notice";

export const metadata: Metadata = {
  title: "Datenschutz",
  description: "Welche Daten Markenfrei verarbeitet, an wen sie gehen und welche Rechte du hast.",
};

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-2 mt-10 font-serif text-2xl tracking-tight text-ink">
      {children}
    </h2>
  );
}

export default function DatenschutzPage() {
  return (
    <div className="pt-8 sm:pt-14">
      <h1 className="font-serif text-4xl leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">Datenschutz</h1>
      <Suspense fallback={<p className="mt-6 text-soft">Lädt …</p>}>
        <WithOperator>
          {({ operator, missing, recommendations }) => (
            <>
              <MissingOperatorNotice missing={missing} recommendations={recommendations} />
              <div className="mt-4 max-w-2xl space-y-3 text-soft">
                <H2 id="verantwortlich">Verantwortlich</H2>
                <p className="whitespace-pre-line">
                  {operator.name || "—"}
                  {"\n"}
                  {operator.address || "—"}
                  {"\n"}E-Mail: {operator.email || "—"}
                </p>

                <H2 id="kurz">Kurz gesagt</H2>
                <p>
                  Markenfrei setzt keine Cookies, nutzt keinen Browser-Speicher, bindet keine Analyse- oder
                  Werbedienste ein und lädt keine Schriften oder Skripte von fremden Servern. Die Anwendung
                  protokolliert keine eingegebenen Namen.
                </p>

                <H2 id="namen">Eingegebene Namen</H2>
                <p>
                  Zur Prüfung sendet der Server den Namen (und daraus abgeleitete Schreibweisen wie Domains) an die
                  Dienste, die du in der Auswahl aktiviert hast. Standardmäßig sind das Domain-Registries (RDAP),
                  DNS-Dienste als Rückfall, Paket-Verzeichnisse, die App Stores von Apple und Google, Wikidata und
                  GLEIF. Optional kommen weitere hinzu. Die vollständige Liste mit den abgefragten Adressen steht
                  auf der Seite <Link href="/quellen" className="underline hover:text-ink">Quellen</Link>.
                </p>
                <p>
                  Viele dieser Dienste sitzen außerhalb der EU, vor allem in den USA. Sie sehen die IP-Adresse des
                  Servers, nicht deine. Ist der eingegebene Name ein Personenname, wird er wie jeder andere Name
                  übermittelt. Gib deshalb keine Namen ein, die du nicht weitergeben willst. Rechtsgrundlage ist die
                  Erbringung der von dir angeforderten Prüfung (Art. 6 Abs. 1 lit. b DSGVO).
                </p>
                <p>
                  Eindeutige Prüfergebnisse (Name, Quelle, Status) hält der Server bis zu zehn Minuten im
                  Arbeitsspeicher, damit wiederholte Prüfungen die Dienste nicht erneut belasten. Sie sind nicht mit
                  deiner IP-Adresse verknüpft und werden nicht dauerhaft gespeichert.
                </p>

                <H2 id="ip">IP-Adresse und Missbrauchsschutz</H2>
                <p>
                  Um Überlastung und Missbrauch zu begrenzen, zählt der Server die Anfragen je IP-Adresse
                  (Zeitfenster von einer Minute) im Arbeitsspeicher. Der Zähler wird nicht gespeichert und verfällt
                  nach dem Fenster. Rechtsgrundlage ist das berechtigte Interesse an einem stabilen Betrieb
                  (Art. 6 Abs. 1 lit. f DSGVO).
                </p>

                <H2 id="hosting">Hosting</H2>
                <p>
                  Die Seite wird bei {operator.hosting || "—"} betrieben. Beim Aufruf verarbeitet der Hosting-Anbieter
                  technisch notwendige Daten (z. B. IP-Adresse, Zeitpunkt, aufgerufene Adresse) in Server-Logs.
                  Rechtsgrundlage ist das berechtigte Interesse an einem sicheren und stabilen Betrieb
                  (Art. 6 Abs. 1 lit. f DSGVO). Die Anwendung selbst schreibt keine Namen in diese Logs, die
                  Adresse einer Seite mit Suchbegriff (<code className="font-mono">?q=</code>) kann der Hosting-Anbieter
                  aber protokollieren.
                </p>

                <H2 id="mcp">MCP-Schnittstelle</H2>
                <p>
                  Wer den MCP-Server nutzt (HTTP oder lokal), löst dieselben Abfragen aus. Der lokal gestartete Server
                  läuft auf dem eigenen Rechner und sendet die Namen von dort an die Dienste.
                </p>

                <H2 id="rechte">Deine Rechte</H2>
                <p>
                  Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
                  Datenübertragbarkeit und Widerspruch. Du kannst dich bei einer Datenschutz-Aufsichtsbehörde
                  beschweren. Da Markenfrei keine Konten führt und Anfragen nicht speichert, kann es sein, dass wir
                  zu einer Anfrage keine Daten haben. Schreib uns an{" "}
                  {operator.email ? (
                    <a className="underline hover:text-ink" href={`mailto:${operator.email}`}>
                      {operator.email}
                    </a>
                  ) : (
                    "—"
                  )}
                  .
                </p>
              </div>
            </>
          )}
        </WithOperator>
      </Suspense>
    </div>
  );
}
