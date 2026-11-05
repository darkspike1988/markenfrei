import type { Metadata } from "next";
import Link from "next/link";
import { Guide, GuideList, GuideSection } from "@/components/guide";
import { buildCheckerConfig } from "@/lib/checker-setup";
import { MAX_NAMES, MAX_TLDS } from "@/lib/engine/check";
import { DEFAULT_DOMAIN_TLDS, DOH_ONLY_TLDS, DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import type { FaqItem } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Domain-Verfügbarkeit prüfen: Was RDAP sagt und was nicht",
  description:
    "Domain-Verfügbarkeit per RDAP prüfen: was „nicht registriert“ bedeutet, was es nicht beweist und warum .at und .eu nur per DNS geprüft werden.",
};

const rdapTlds = DOMAIN_TLDS.filter((t) => !DOH_ONLY_TLDS.includes(t));

const FAQ: FaqItem[] = [
  {
    q: "Heißt „bei der Registry nicht registriert“, dass ich die Domain kaufen kann?",
    a: "Nein. Es heißt nur, dass die Registry der Endung die Domain nicht als registriert führt. Reservierte oder gesperrte Namen sind möglich, und Premium- oder reservierte Domains erkennt RDAP nicht. Ob die Domain sich registrieren lässt, zeigt erst ein Registrar.",
  },
  {
    q: "Warum zeigt Markenfrei bei .at und .eu nie „nicht gefunden“?",
    a: "Für diese Endungen gibt es hier kein verlässliches öffentliches RDAP. Markenfrei fragt nur das DNS ab: Sind NS-Einträge vorhanden, ist die Domain vergeben. Fehlen sie, bleibt der Status offen, denn kein DNS-Eintrag beweist keine Registrierbarkeit.",
  },
  {
    q: "Wie viele Endungen prüft Markenfrei?",
    a: `${DOMAIN_TLDS.length} Endungen stehen zur Auswahl, davon ${rdapTlds.length} per RDAP und ${DOH_ONLY_TLDS.length} nur per DNS. Vorausgewählt sind ${DEFAULT_DOMAIN_TLDS.map((t) => "." + t).join(", ")}; pro Prüfung sind höchstens ${MAX_TLDS} Endungen möglich.`,
  },
];

export default function DomainPruefenPage() {
  const config = buildCheckerConfig(["domains"]);
  return (
    <Guide
      path="/domain-pruefen"
      title="Domain-Verfügbarkeit prüfen: Was RDAP sagt und was nicht"
      config={config}
      faq={FAQ}
      lead={
        <>
          <p>
            Ob eine Domain vergeben ist, fragt man bei der Registry der Endung ab, heute per RDAP. Markenfrei tut das für dich;
            „bei der Registry nicht registriert“ ist dabei ein gutes Zeichen, aber kein Beleg, dass du die Domain bekommst.
          </p>
        </>
      }
      limits={
        <>
          <GuideList>
            <li>
              „Nicht gefunden“ heißt nie „frei“ oder „registrierbar“. Die Abfrage sieht nur, was die Registry als
              registriert führt.
            </li>
            <li>
              Reservierte, gesperrte und Premium-Namen sowie Namen in einer Karenz- oder Löschfrist sind aus RDAP nicht
              abzulesen. Ob und wie die Registry sie zeigt, unterscheidet sich je Endung und wird hier nicht ausgewertet.
            </li>
            <li>
              Bei .at und .eu kann Markenfrei höchstens „vergeben“ bestätigen. Alles andere bleibt offen und muss bei der
              Registry nachgesehen werden.
            </li>
            <li>
              Eine Antwort der Registry ist eine Momentaufnahme. Sie sagt nichts über Markenrechte Dritter an dem Namen
              (siehe{" "}
              <Link href="/markenrecherche-vorbereiten" className="underline hover:text-ink">
                Markenrecherche vorbereiten
              </Link>
              ).
            </li>
            <li>Antwortet eine Registry nicht oder drosselt sie, steht der Status auf „unbekannt“, nie auf „frei“.</li>
          </GuideList>
        </>
      }
    >
      <GuideSection id="rdap" title="So funktioniert die Abfrage">
        <p>
          RDAP (Registration Data Access Protocol) ist ein standardisiertes Abfrageprotokoll für Registrierungsdaten von
          Domains; es soll WHOIS ablösen. Jede Registry betreibt einen eigenen RDAP-Server. Welcher für welche Endung
          zuständig ist, steht im Bootstrap-Verzeichnis der IANA (RFC 9224). Für Endungen, die dort fehlen, zum Beispiel
          .de und .io, hinterlegt Markenfrei feste Server.
        </p>
        <p>
          Ausgewertet wird allein der HTTP-Status der Antwort: 200 heißt, die Domain ist bei der Registry registriert, 404
          heißt, sie ist dort nicht registriert. Zusätzlich fragt Markenfrei das DNS über HTTPS ab, aber nur, um „vergeben“
          zu bestätigen, wenn RDAP nicht antwortet. Ein fehlender DNS-Eintrag zählt nie als Beleg für „frei“.
        </p>
        <p>
          Zu jeder Zeile verlinkt Markenfrei eine Seite zum Nachprüfen: für .de die Auskunft der DENIC, für .ch, .li, .at
          und .eu die Seite der jeweiligen Registry, sonst die Domain-Abfrage der ICANN.
        </p>
      </GuideSection>

      <GuideSection id="nicht-registriert" title="Was „nicht registriert“ bedeutet">
        <p>
          Die Registry führt den Namen nicht als Domain. Mehr sagt die Antwort nicht. Davon bleibt offen:
        </p>
        <GuideList>
          <li>
            <strong className="font-medium text-ink">Reservierte oder gesperrte Namen:</strong> Registries halten Namen
            zurück, die sich nicht registrieren lassen, auch wenn sie nicht als Domain eingetragen sind.
          </li>
          <li>
            <strong className="font-medium text-ink">Premium-Domains:</strong> Sie sind nicht registriert, aber oft nur zu
            einem anderen Preis oder gar nicht zu haben. RDAP erkennt das nicht.
          </li>
          <li>
            <strong className="font-medium text-ink">Karenzzeit:</strong> Frisch gekündigte oder gelöschte Domains können
            sich in einer Frist befinden, in der sie nicht sofort frei sind. Wie lange das dauert und was die Registry
            währenddessen ausgibt, hängt von der Endung ab.
          </li>
          <li>
            <strong className="font-medium text-ink">Der Registrar:</strong> Ob eine Domain sich tatsächlich bestellen
            lässt, entscheidet am Ende der Registrar beim Bestellvorgang.
          </li>
        </GuideList>
        <p>
          Lies „nicht registriert“ deshalb als „kein Hindernis gefunden“. Der nächste Schritt ist die Bestellung oder die
          Abfrage beim Registrar.
        </p>
      </GuideSection>

      <GuideSection id="at-eu" title="Warum .at und .eu nur per DNS laufen">
        <p>
          Für diese beiden Endungen gibt es kein verlässliches öffentliches RDAP. Markenfrei fragt deshalb nur das DNS nach
          NS-Einträgen. Sind welche vorhanden, ist die Domain vergeben. Sind keine vorhanden, bleibt der Status offen:
          Eine Domain kann registriert sein, ohne dass das DNS etwas liefert. Das Ergebnis ist also höchstens „vergeben“,
          nie „nicht gefunden“; für ein „frei“ musst du bei der Registry nachsehen.
        </p>
      </GuideSection>

      <GuideSection id="endungen" title="Welche Endungen unterstützt sind">
        <p>
          Zur Auswahl stehen {DOMAIN_TLDS.length} Endungen, {rdapTlds.length} davon per RDAP und {DOH_ONLY_TLDS.length} nur
          per DNS. Vorausgewählt sind {DEFAULT_DOMAIN_TLDS.map((t) => "." + t).join(", ")}. Pro Prüfung gehen höchstens{" "}
          {MAX_TLDS} Endungen und {MAX_NAMES} Namen.
        </p>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium text-ink">Per RDAP ({rdapTlds.length})</dt>
            <dd className="mt-1 font-mono text-[13px] leading-relaxed text-soft">
              {rdapTlds.map((t) => "." + t).join(" ")}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Nur per DNS ({DOH_ONLY_TLDS.length})</dt>
            <dd className="mt-1 font-mono text-[13px] leading-relaxed text-soft">
              {DOH_ONLY_TLDS.map((t) => "." + t).join(" ")}
            </dd>
          </div>
        </dl>
        <p>
          Die Endungen stehen mit Verfahren und Server auch auf der Seite{" "}
          <Link href="/quellen#domains" className="underline hover:text-ink">
            Quellen
          </Link>
          .
        </p>
      </GuideSection>

      <GuideSection id="tipps" title="Tipps für einen Namen über mehrere Endungen">
        <GuideList>
          <li>Gib den Namen ohne Endung ein; die Endungen wählst du im Prüfer unter „Anpassen“.</li>
          <li>
            Erlaubt sind 2 bis 63 Zeichen aus a–z, 0–9 und Bindestrich, ohne Bindestrich am Anfang oder Ende und ohne
            Bindestrich an Stelle 3 und 4 (das ist für die IDN-Kodierung xn-- reserviert). Umlaute schreibt Markenfrei aus
            (ä wird ae); Domains mit echten Umlauten werden nicht geprüft.
          </li>
          <li>
            Prüfe mehrere Kandidaten auf einmal: Eine Shortlist mit bis zu {MAX_NAMES} Namen wird nebeneinander verglichen.
          </li>
          <li>
            Ein Name, der in einer Endung frei aussieht und in einer anderen vergeben ist, kann trotzdem verwechselbar
            sein. Prüfe auch Pakete, App Stores und die Marke (siehe die Anleitungen unten).
          </li>
          <li>Sieht ein Name gut aus, sichere ihn zeitnah beim Registrar: Die Abfrage reserviert nichts.</li>
        </GuideList>
      </GuideSection>
    </Guide>
  );
}
