import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MissingOperatorNotice, WithOperator } from "@/components/operator-notice";
import { mailConfigFromEnv } from "@/lib/mail";

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
      <Suspense fallback={<div className="mt-6 min-h-[70vh]" aria-hidden />}>
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
                  Markenfrei setzt keine Cookies, nutzt keinen Browser-Speicher und lädt keine Schriften oder
                  Skripte von fremden Servern. Die Anwendung protokolliert keine eingegebenen Namen. Zur
                  Verbesserung der Seite gibt es eine einfache Reichweitenmessung auf dem eigenen Server, ohne
                  Cookies und ohne die eingegebenen Namen (siehe{" "}
                  <a href="#reichweite" className="underline hover:text-ink">Reichweitenmessung</a>).
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

                <H2 id="reichweite">Reichweitenmessung</H2>
                <p>
                  Um zu sehen, welche Seiten und Funktionen genutzt werden und wo die Seite verbessert werden
                  muss, zählt der Betreiber Seitenaufrufe mit GoatCounter, einer Open-Source-Software, die auf
                  demselben Server wie Markenfrei läuft. Es gibt keine Cookies, keinen Zugriff auf den
                  Speicher deines Browsers und keine Weitergabe an Dritte.
                </p>
                <p>
                  Pro Seitenaufruf werden der Pfad der Seite ohne Query-Teil, der Seitentitel, die Adresse einer
                  externen Herkunftsseite (nur der Domainname), die Bildschirmbreite, Browser und Betriebssystem,
                  die Sprache und das Land gespeichert. Das Land bestimmt der Server aus deiner IP-Adresse mit
                  einer lokalen Datenbank; die IP-Adresse selbst wird nicht gespeichert. Zur Zählung von
                  Besuchern dient eine anonyme, regelmäßig wechselnde Kennung, aus der sich keine Person ableiten
                  lässt. Außerdem werden einzelne Aktionen gezählt, ohne Inhalte: Prüfung gestartet, Ampelfarbe
                  des Ergebnisses, aktivierte zusätzliche Quellen und Endungen, JSON-Export.
                </p>
                <p>
                  Nie übertragen werden die eingegebenen Namen, die Adresszeile mit deiner Auswahl und die
                  Texte deiner Nachrichten. Wenn dein Browser „Do Not Track“ oder „Global Privacy Control“
                  sendet, findet keine Zählung statt. Die Auswertung sieht nur der Betreiber. Die Daten werden
                  nach zwölf Monaten gelöscht. Rechtsgrundlage ist das berechtigte Interesse an einer
                  bedarfsgerechten, stabilen Seite (Art. 6 Abs. 1 lit. f DSGVO); du kannst der Verarbeitung
                  jederzeit widersprechen, siehe Deine Rechte.
                </p>

                {mailConfigFromEnv().configured ? (
                  <>
                    <H2 id="kontakt">Kontaktformular</H2>
                    <p>
                      Wenn du das <Link href="/kontakt" className="underline hover:text-ink">Kontaktformular</Link>{" "}
                      nutzt, verarbeiten wir deinen Namen (freiwillig), deine E-Mail-Adresse und den Text deiner
                      Nachricht. Mit dem Häkchen bestätigst du, dass du diese Datenschutzerklärung gelesen hast; den
                      Zeitpunkt dieser Bestätigung speichern wir nicht. Zur Abwehr von Spam trägt das Formular eine
                      signierte Zeitangabe vom Laden der Seite; auch sie wird nicht gespeichert.
                    </p>
                    <p>
                      Zweck ist, deine Anfrage zu beantworten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, wenn
                      deine Anfrage einen Vertrag oder vorvertragliche Maßnahmen betrifft, sonst unser berechtigtes
                      Interesse an der Beantwortung von Anfragen (Art. 6 Abs. 1 lit. f DSGVO).
                    </p>
                    <p>
                      Die Nachricht wird per E-Mail über den E-Mail-Server des Betreibers zugestellt; für das Formular
                      ist kein Dienst Dritter eingebunden. Die Anwendung selbst speichert Name, Adresse und Nachricht
                      nicht und schreibt sie in kein Protokoll. Sie liegen nur im Arbeitsspeicher, bis der Versand
                      abgeschlossen ist. Danach besteht eine Kopie als E-Mail im Postfach des Betreibers.
                    </p>
                    <p>
                      Um Missbrauch zu begrenzen, zählt der Server die gesendeten Nachrichten je IP-Adresse (höchstens
                      drei pro Stunde) im Arbeitsspeicher. Die IP-Adresse steht nicht in der E-Mail, der Zähler wird
                      nicht gespeichert und verfällt nach der Stunde. Rechtsgrundlage ist das berechtigte Interesse an
                      einem stabilen Betrieb (Art. 6 Abs. 1 lit. f DSGVO).
                    </p>
                    <p>
                      Speicherdauer: Die Kopie im Postfach wird gelöscht, sobald die Angelegenheit erledigt ist und
                      keine gesetzlichen Aufbewahrungspflichten entgegenstehen. Deine Rechte stehen weiter unten.
                    </p>
                  </>
                ) : null}

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
                  beschweren. Da Markenfrei keine Konten führt und Suchanfragen nicht speichert, kann es sein, dass
                  wir zu einer Anfrage keine Daten haben (Nachrichten über das Kontaktformular liegen als E-Mail im
                  Postfach des Betreibers). Schreib uns an{" "}
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
