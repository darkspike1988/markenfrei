import type { Metadata } from "next";
import Link from "next/link";
import { Guide, GuideList, GuideSection } from "@/components/guide";
import { buildCheckerConfig } from "@/lib/checker-setup";
import { TRADEMARK_LINKS_CHECKED, trademarkPrep } from "@/lib/engine/trademark-prep";
import type { FaqItem } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Markenrecherche vorbereiten: DPMA, EUIPO, WIPO",
  description:
    "Markenrecherche vorbereiten: Markenfrei fragt keine Markenregister ab, liefert aber Links zu DPMA, EUIPO und WIPO, Suchstring, Varianten und Checkliste.",
};

/** Beispielname für die Beschreibung des Suchstrings; wird zur Buildzeit durch die echte Vorbereitung erzeugt. */
const EXAMPLE = "wachwerk";

const FAQ: FaqItem[] = [
  {
    q: "Fragt Markenfrei das DPMA-Register oder das EUIPO ab?",
    a: "Nein. Markenfrei fragt keine Markenregister ab, weil sich bei keinem der geprüften Register ein Zugang ohne Schlüssel, Vertrag oder Registrierung belegen ließ. Stattdessen gibt es Links zur manuellen Suche, einen DPMA-Expertensuchstring, Schreibvarianten, einen Klassenvorschlag und eine Checkliste.",
  },
  {
    q: "Heißt eine leere Trefferliste, dass der Name als Marke frei ist?",
    a: "Nein. Eine leere Trefferliste heißt nur, dass die Suche nichts gefunden hat. Das DPMAregister hat zum Beispiel keine Ähnlichkeitssuche, und auch nicht eingetragene Kennzeichen und Werktitel können Rechte begründen.",
  },
  {
    q: "Ist die Vorbereitung eine Rechtsberatung?",
    a: "Nein. Markenfrei bietet keine Rechtsberatung. Bei Treffern oder Zweifeln solltest du vor der Anmeldung eine Patentanwältin oder einen Anwalt für Markenrecht fragen.",
  },
];

export default function MarkenrechercheVorbereitenPage() {
  const config = buildCheckerConfig();
  const prep = trademarkPrep("beispiel");
  const example = trademarkPrep(EXAMPLE);
  const checked = new Date(TRADEMARK_LINKS_CHECKED).toLocaleDateString("de-DE", { dateStyle: "long" });

  return (
    <Guide
      path="/markenrecherche-vorbereiten"
      title="Markenrecherche vorbereiten: DPMA, EUIPO, WIPO"
      config={config}
      faq={FAQ}
      lead={
        <>
          <p>
            Markenfrei prüft keine Marken und fragt keine Markenregister ab. Es bereitet die Recherche vor, die du selbst bei
            DPMA, EUIPO, WIPO und weiteren Stellen durchführst: mit Links, einem DPMA-Suchstring, Schreibvarianten, einem
            Klassenvorschlag und einer Checkliste. Das ist keine Rechtsberatung.
          </p>
        </>
      }
      limits={
        <>
          <GuideList>
            <li>
              <strong className="font-medium text-ink">Keine Rechtsberatung.</strong> Ob ein Name als Marke eintragbar ist
              oder Rechte Dritter verletzt, beurteilen eine Patentanwältin oder ein Anwalt für Markenrecht.
            </li>
            <li>
              Die Ampel von Markenfrei enthält keine Marken. Sie steht bei der Marke immer auf „nicht geprüft“ und ersetzt
              keine Registerrecherche.
            </li>
            <li>Eine leere Trefferliste in einem Register heißt nicht, dass der Name als Marke frei ist.</li>
            <li>
              Die Links sind zuletzt am {checked} geprüft. Das Vorausfüllen über den Link ist bei einzelnen Registern nicht
              offiziell dokumentiert und kann sich ändern.
            </li>
            <li>Der Klassenvorschlag ist ein Ausgangspunkt. Welche Waren und Dienstleistungen gelten, legst du fest.</li>
          </GuideList>
        </>
      }
    >
      <GuideSection id="nicht" title="Was Markenfrei nicht tut">
        <p>
          Markenfrei fragt kein Markenregister ab. Der Grund ist, dass sich keines der geprüften Register ohne Schlüssel und
          ohne Vertrag live abfragen lässt (Prüfung vom 4. November 2026):
        </p>
        <GuideList>
          <li>
            <strong className="font-medium text-ink">DPMAregister:</strong> Die Web-Recherche ist kostenlos, aber nur manuell
            und ohne Ähnlichkeitssuche. Maschinenlesbare Daten gibt es über DPMAconnectPlus auf Grundlage einer vertraglichen
            Regelung.
          </li>
          <li>
            <strong className="font-medium text-ink">EUIPO:</strong> Der Zugang zur Schnittstelle läuft über ein Konto und
            eine Freischaltung.
          </li>
          <li>
            <strong className="font-medium text-ink">USPTO:</strong> Die Schnittstelle verlangt einen API-Schlüssel.
          </li>
          <li>
            <strong className="font-medium text-ink">TMview und WIPO Global Brand Database:</strong> Ein offener Zugang ist
            nicht belegt.
          </li>
          <li>
            <strong className="font-medium text-ink">TMDB:</strong> Die Suche ist für Menschen kostenlos, hat aber keine
            Schnittstelle und eine Bot-Abwehr. Markenfrei umgeht sie nicht.
          </li>
        </GuideList>
        <p>
          Die Details stehen im Repository in <span className="font-mono text-[13px]">docs/trademark-registers.md</span>.
        </p>
      </GuideSection>

      <GuideSection id="vorbereitung" title="Was Markenfrei vorbereitet">
        <p>
          Zu jedem geprüften Namen gibt es im Ergebnis den Block „Marke: nicht geprüft“, den du aufklappst. Er enthält:
        </p>
        <ul className="divide-y divide-line border-y border-line">
          {prep.links.map((l) => (
            <li key={l.label} className="py-3">
              <span className="font-medium text-ink">{l.label}</span>{" "}
              <span className="text-sm text-muted">({l.office})</span>
              <p className="mt-0.5 text-sm text-soft">{l.what}</p>
            </li>
          ))}
        </ul>
        <p>
          Die Links stehen im Ergebnis mit deinem Namen; dort sind sie, wo es das Register zulässt, vorausgefüllt. Alle
          Register mit Adresse stehen auch auf der Seite{" "}
          <Link href="/quellen#marke" className="underline hover:text-ink">
            Quellen
          </Link>
          .
        </p>
      </GuideSection>

      <GuideSection id="suchstring" title="DPMA-Expertensuchstring und Schreibvarianten">
        <p>
          Das DPMAregister hat keine Ähnlichkeitssuche. Hilfreich ist die Expertenrecherche mit Platzhaltern: Du fügst einen
          fertigen Suchstring ins Eingabefeld ein. Für den Namen „{EXAMPLE}“ sieht er so aus:
        </p>
        <code className="block break-words rounded-md border border-line bg-wash px-3 py-2 font-mono text-[13px] leading-relaxed text-ink">
          {example.dpmaExpertQuery}
        </code>
        <p>
          <span className="font-mono text-[13px]">MARKE=</span> sucht in der Markenbezeichnung, das{" "}
          <span className="font-mono text-[13px]">?</span> steht für beliebig viele Zeichen, und{" "}
          <span className="font-mono text-[13px]">KL=09</span> schränkt auf die Klasse 9 ein. Das DPMA gleicht Trennzeichen
          aus, deshalb stehen die Varianten ohne Bindestrich im Suchstring.
        </p>
        <p>
          Die Schreibvarianten wählt Markenfrei regelbasiert, zum Beispiel Umlautschreibungen, ph und f, c, k und z, i und y,
          Doppelkonsonanten und klangähnliche Formen. Für „{EXAMPLE}“ ist das:{" "}
          <span className="font-mono text-[13px]">{example.variants.join(", ")}</span>. Suche diese Varianten in jedem
          Register mit.
        </p>
      </GuideSection>

      <GuideSection id="klassen" title="Klassenvorschlag">
        <p>
          Marken werden für Waren und Dienstleistungen in Klassen der Nizza-Klassifikation angemeldet. Ohne Angaben zu deinem
          Vorhaben schlägt Markenfrei diese Klassen vor (für Apps und Webdienste):
        </p>
        <GuideList>
          {prep.classes.map((c) => (
            <li key={c.number}>{c.title}</li>
          ))}
        </GuideList>
        <p>
          Der Vorschlag ist ein Ausgangspunkt, keine Beratung. Treffer in gleichen oder ähnlichen Klassen sind besonders
          genau anzusehen.
        </p>
      </GuideSection>

      <GuideSection id="checkliste" title="Checkliste">
        <p>Die Checkliste im Ergebnis enthält diese Schritte:</p>
        <ol className="list-decimal space-y-1.5 pl-5 marker:text-muted">
          {prep.checklist.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
      </GuideSection>
    </Guide>
  );
}
