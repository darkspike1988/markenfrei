import type { Metadata } from "next";
import Link from "next/link";
import { Guide, GuideList, GuideSection } from "@/components/guide";
import { buildCheckerConfig } from "@/lib/checker-setup";
import { STATIC_SOURCES } from "@/lib/engine/check";
import type { FaqItem } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Paketnamen prüfen: npm, PyPI, crates.io, GitHub und mehr",
  description:
    "Paketnamen bei npm, PyPI, crates.io, GitHub und Homebrew prüfen, weitere Register auf Wunsch. Warum ein scheinbar freier Name trotzdem abgelehnt werden kann.",
};

const packageSources = STATIC_SOURCES.filter((s) => s.namespace === "packages");
const standard = packageSources.filter((s) => s.defaultEnabled);
const optional = packageSources.filter((s) => !s.defaultEnabled);
const standardLabels = standard.map((s) => s.label);

function joinDe(items: string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} und ${items[items.length - 1]}`;
}

const FAQ: FaqItem[] = [
  {
    q: "Reicht es, wenn npm oder PyPI den Namen nicht kennt?",
    a: "Nein. „Kein Paket gefunden“ heißt nur, dass das Register den Namen nicht führt. npm kann ähnliche Namen trotzdem ablehnen, PyPI kann gesperrte oder ähnliche Namen ablehnen, und crates.io behandelt - und _ gleich und sperrt manche Namen. Markenfrei fragt deshalb alle Schreibweisen ab (bis zu zwei Bindestriche).",
  },
  {
    q: "Welche Register prüft Markenfrei standardmäßig?",
    a: `Standard sind ${joinDe(standardLabels)}. Weitere ${optional.length} Quellen für Pakete lassen sich im Prüfer unter „Anpassen“ und „Weitere Quellen“ dazuschalten.`,
  },
  {
    q: "Warum prüft Markenfrei bei GitHub Nutzer und Organisationen?",
    a: "Weil unter github.com/<name> Nutzer und Organisationen liegen. Ist der Name dort vergeben, kannst du dein Projekt nicht unter einem gleichnamigen Konto oder einer gleichnamigen Organisation führen. Repositories mit gleichem Namen unter anderen Konten sind davon unberührt und werden nicht geprüft.",
  },
];

export default function PaketnamePruefenPage() {
  const config = buildCheckerConfig(["packages"]);
  return (
    <Guide
      path="/paketname-pruefen"
      title="Paketnamen prüfen: npm, PyPI, crates.io, GitHub und mehr"
      config={config}
      faq={FAQ}
      lead={
        <p>
          Markenfrei fragt für deinen Namen standardmäßig {joinDe(standardLabels)} ab und auf Wunsch {optional.length} weitere
          Quellen. „Kein Paket gefunden“ heißt nur, dass das Register den Namen nicht kennt; ob du ihn veröffentlichen darfst,
          entscheidet das Register beim Veröffentlichen.
        </p>
      }
      limits={
        <GuideList>
          <li>
            „Nicht gefunden“ heißt nie „frei“. Register lehnen gesperrte oder ähnliche Namen ab, ohne dass ein Paket mit
            genau diesem Namen existiert.
          </li>
          <li>
            Die Namen werden so geprüft, wie Markenfrei sie normalisiert: Kleinbuchstaben, a–z, 0–9 und Bindestrich, Umlaute
            ausgeschrieben.
          </li>
          <li>
            Einige der optionalen Quellen lesen einen Index (ecosyste.ms) statt des Registers selbst; sehr neue Pakete können
            dort fehlen.
          </li>
          <li>
            Bei GitHub zählt nur, ob es einen Nutzer oder eine Organisation gibt. Erreicht Markenfrei das Rate-Limit von
            GitHub, ist der Status „unbekannt“ und nie „frei“.
          </li>
          <li>
            Bei Maven Central ist eine artifactId nur zusammen mit der groupId eindeutig; bei Packagist wird der
            Vendor-Namespace geprüft, nicht ein einzelnes Paket.
          </li>
          <li>Ob ein Name rechtlich frei von Markenrechten ist, sagt keines dieser Register.</li>
        </GuideList>
      }
    >
      <GuideSection id="register" title="Welche Register geprüft werden">
        <p>
          Standardmäßig laufen diese {standard.length} Quellen mit; jede liefert genau einen Status.
        </p>
        <ul className="divide-y divide-line border-y border-line">
          {standard.map((s) => (
            <li key={s.id} className="py-3">
              <span className="font-medium text-ink">{s.label}</span>
              <p className="mt-0.5 text-sm text-soft">{s.description}</p>
            </li>
          ))}
        </ul>
        <p>
          Auf Wunsch kommen {optional.length} weitere hinzu. Du schaltest sie im Prüfer unter „Anpassen“ und „Weitere
          Quellen“ dazu.
        </p>
        <ul className="divide-y divide-line border-y border-line">
          {optional.map((s) => (
            <li key={s.id} className="py-3">
              <span className="font-medium text-ink">{s.label}</span>
              <p className="mt-0.5 text-sm text-soft">{s.description}</p>
            </li>
          ))}
        </ul>
        <p>
          Endpunkte und Grenzen aller Quellen stehen auf der Seite{" "}
          <Link href="/quellen#packages" className="underline hover:text-ink">
            Quellen
          </Link>
          .
        </p>
      </GuideSection>

      <GuideSection id="regeln" title="Warum ein freier Name trotzdem unbrauchbar sein kann">
        <p>Die Register haben Regeln, die über „existiert schon“ hinausgehen. Das meldet Markenfrei in der Zeile der Quelle:</p>
        <GuideList>
          <li>
            <strong className="font-medium text-ink">npm:</strong> kann ähnliche Namen trotzdem ablehnen.
          </li>
          <li>
            <strong className="font-medium text-ink">PyPI:</strong> Der Name wird nach PEP 503 normalisiert; Folgen aus -, _
            und . gelten als gleich. PyPI kann außerdem gesperrte oder ähnliche Namen ablehnen.
          </li>
          <li>
            <strong className="font-medium text-ink">crates.io:</strong> behandelt - und _ gleich und sperrt manche Namen.
          </li>
          <li>
            <strong className="font-medium text-ink">GitHub:</strong> Reservierte oder gesperrte Namen sind möglich, auch
            wenn es keinen Nutzer und keine Organisation gibt.
          </li>
          <li>
            <strong className="font-medium text-ink">RubyGems:</strong> kann zu ähnliche Namen ablehnen; Namen in anderer
            Groß- und Kleinschreibung zählen als vorhanden.
          </li>
          <li>
            <strong className="font-medium text-ink">CRAN:</strong> lehnt Namen ab, die sich nur in Groß- und Kleinschreibung
            unterscheiden.
          </li>
          <li>
            <strong className="font-medium text-ink">pub.dev und Hex.pm:</strong> erlauben keinen Bindestrich; Markenfrei
            nennt die Variante mit Unterstrich, CRAN die mit Punkt.
          </li>
          <li>
            <strong className="font-medium text-ink">Homebrew:</strong> Geprüft werden nur die Haupt-Taps; Aliase und
            umbenannte Formulae nicht.
          </li>
        </GuideList>
        <p>
          Prüfe deshalb auch Schreibvarianten (mit - statt _, mit und ohne Bindestrich), bevor du dich auf einen Namen
          festlegst.
        </p>
      </GuideSection>

      <GuideSection id="github" title="Warum GitHub-Namen wichtig sind">
        <p>
          Bei GitHub prüft Markenfrei, ob es einen Nutzer oder eine Organisation mit dem Namen gibt. Das ist die Adresse
          github.com/&lt;name&gt;, unter der viele Projekte, Dokumentation und Releases liegen. Ist der Name dort vergeben,
          musst du für ein gleichnamiges Konto oder eine Organisation auf eine Variante ausweichen, auch wenn npm oder PyPI
          den Namen noch kennen. Gleichnamige Repositories unter anderen Konten sind davon nicht betroffen und werden nicht
          geprüft.
        </p>
      </GuideSection>
    </Guide>
  );
}
