import type { Metadata } from "next";
import Link from "next/link";
import { Guide, GuideList, GuideSection } from "@/components/guide";
import { buildCheckerConfig } from "@/lib/checker-setup";
import { STATIC_SOURCES } from "@/lib/engine/check";
import type { FaqItem } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "App-Namen prüfen: App Store und Google Play",
  description:
    "App-Namen im deutschen App Store und über Android-Bundle-IDs bei Google Play prüfen. Was die Prüfung abdeckt und was nicht: andere Länder, andere IDs.",
};

const optionalStores = STATIC_SOURCES.filter((s) => s.namespace === "stores" && !s.defaultEnabled);

const FAQ: FaqItem[] = [
  {
    q: "Prüft Markenfrei den App-Namen auch in anderen Ländern?",
    a: "Nein. Der App Store wird nur im deutschen Store durchsucht, in den ersten 25 Treffern der Suche. Andere Länder sind nicht geprüft.",
  },
  {
    q: "Prüft Markenfrei bei Google Play den App-Titel?",
    a: "Nein. Bei Google Play fragt Markenfrei nur die Bundle-IDs com.<name>.app und de.<name>.app ab. App-Titel und andere Bundle-IDs sind nicht geprüft.",
  },
  {
    q: "Heißt „nicht gefunden“, dass ich den App-Namen verwenden darf?",
    a: "Nein. „Nicht gefunden“ heißt nur, dass die abgefragte Suche oder die abgefragten Bundle-IDs den Namen nicht kennen. Die Prüfung ist eine Vorprüfung und sagt nichts über Markenrechte oder die Regeln der Stores.",
  },
];

export default function AppNamePruefenPage() {
  const config = buildCheckerConfig(["stores"]);
  return (
    <Guide
      path="/app-name-pruefen"
      title="App-Namen prüfen: App Store und Google Play"
      config={config}
      faq={FAQ}
      lead={
        <p>
          Markenfrei sucht deinen Namen im deutschen App Store und prüft bei Google Play, ob die Bundle-IDs com.&lt;name&gt;.app
          und de.&lt;name&gt;.app belegt sind. Das ist eine Vorprüfung: Andere Länder, andere Bundle-IDs und App-Titel bei
          Google Play sind nicht abgedeckt.
        </p>
      }
      limits={
        <>
          <GuideList>
            <li>
              „Nicht gefunden“ heißt nur, dass die Quelle den Namen nicht kennt. Es heißt nie, dass der Name im Store
              verfügbar ist oder dass du ihn verwenden darfst.
            </li>
            <li>Der App Store wird nur im deutschen Store geprüft. Andere Länder sind nicht geprüft.</li>
            <li>
              Die Suche liefert höchstens 25 Treffer. Eine App, die dort nicht unter den Treffern erscheint, bleibt
              unbemerkt.
            </li>
            <li>
              Bei Google Play werden nur die beiden genannten Bundle-IDs geprüft, keine App-Titel und keine anderen IDs.
              Deine tatsächliche ID kann anders lauten.
            </li>
            <li>
              Ähnliche Titel erkennt nur der App Store, und nur in zwei Fällen: Der Titel beginnt mit dem Namen als ganzem
              Wort, oder er klingt gleich (Kölner Phonetik). Alles darüber hinaus ist nicht abgedeckt.
            </li>
            <li>Antwortet ein Store nicht oder ist das Abfragebudget erschöpft, steht der Status auf „unbekannt“.</li>
          </GuideList>
          <p>
            Zu einer Marke sagt die Prüfung nichts (siehe{" "}
            <Link href="/markenrecherche-vorbereiten" className="underline hover:text-ink">
              Markenrecherche vorbereiten
            </Link>
            ). Keine Rechtsberatung.
          </p>
        </>
      }
    >
      <GuideSection id="app-store" title="App Store: was geprüft wird">
        <p>
          Markenfrei nutzt die Suche des deutschen App Stores (iTunes Search API, Land Deutschland, Software, bis zu 25
          Treffer) und vergleicht die Titel mit deinem Namen.
        </p>
        <GuideList>
          <li>
            <strong className="font-medium text-ink">Vergeben:</strong> Der Haupttitel einer App gleicht deinem Namen
            (Groß- und Kleinschreibung und Sonderzeichen spielen keine Rolle). Als Haupttitel gilt der Teil vor „:“, „–“,
            „—“, „|“ oder „-“.
          </li>
          <li>
            <strong className="font-medium text-ink">Ähnlich:</strong> Ein Titel beginnt mit deinem Namen als ganzem Wort
            oder klingt gleich (Kölner Phonetik). Das ist ein Hinweis zum Nachsehen, kein Treffer.
          </li>
          <li>
            <strong className="font-medium text-ink">Nicht gefunden:</strong> Unter den Treffern steht kein App-Titel mit
            diesem Namen. Das bezieht sich auf den deutschen Store.
          </li>
        </GuideList>
      </GuideSection>

      <GuideSection id="google-play" title="Google Play: was geprüft wird">
        <p>
          Bei Google Play sucht Markenfrei keine Titel. Stattdessen ruft Markenfrei die App-Seiten zu den Bundle-IDs
          com.&lt;name&gt;.app und de.&lt;name&gt;.app ab (HEAD-Anfrage). Gibt es eine Seite, ist die ID vergeben; gibt es
          unter beiden keine, steht „nicht gefunden“.
        </p>
        <p>
          Für die ID wird der Name auf Buchstaben und Ziffern reduziert, Bindestriche fallen weg. Beginnt das Ergebnis nicht
          mit einem Buchstaben oder ist es ein Java-Schlüsselwort, ist der Name als Android-Paketname nicht zulässig und
          wird nicht abgefragt.
        </p>
      </GuideSection>

      <GuideSection id="manuell" title="Selbst nachsehen">
        <p>
          In der Zeile der Quelle verlinkt Markenfrei die Suche im jeweiligen Store, bei einem Treffer die App selbst. Die
          Suche hat diese Form, mit deinem Namen anstelle von &lt;Name&gt;:
        </p>
        <GuideList>
          <li>
            <span className="font-medium text-ink">App Store:</span>{" "}
            <code className="break-all font-mono text-[13px]">https://apps.apple.com/de/iphone/search?term=&lt;Name&gt;</code>
          </li>
          <li>
            <span className="font-medium text-ink">Google Play:</span>{" "}
            <code className="break-all font-mono text-[13px]">https://play.google.com/store/search?q=&lt;Name&gt;&amp;c=apps</code>
          </li>
        </GuideList>
        <p>
          Dort siehst du auch ähnliche Titel, die Markenfrei nicht bewertet. Sieh dir mindestens die ersten Treffer selbst an
          und schau auch in anderen Ländern nach, wenn du dort veröffentlichen willst.
        </p>
        {optionalStores.length > 0 && (
          <p>
            Auf Wunsch fragt Markenfrei weitere Stores ab, im Prüfer unter „Anpassen“ und „Weitere Quellen“:{" "}
            {optionalStores.map((s) => s.label).join(", ")}.
          </p>
        )}
      </GuideSection>
    </Guide>
  );
}
