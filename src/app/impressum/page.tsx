import type { Metadata } from "next";
import { Suspense } from "react";
import { MissingOperatorNotice, WithOperator } from "@/components/operator-notice";

export const metadata: Metadata = {
  title: "Impressum",
  description: "Anbieterkennzeichnung nach § 5 DDG.",
};

export default function ImpressumPage() {
  return (
    <div className="pt-8 sm:pt-14">
      <h1 className="font-serif text-4xl leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">Impressum</h1>
      <Suspense fallback={<p className="mt-6 text-soft">Lädt …</p>}>
        <WithOperator>
          {({ operator, missing, recommendations }) => (
            <>
              <MissingOperatorNotice missing={missing} recommendations={recommendations} />
              <div className="mt-6 max-w-2xl space-y-6 text-soft">
                <section aria-labelledby="anbieter">
                  <h2 id="anbieter" className="mb-1 font-medium text-ink">Angaben nach § 5 DDG</h2>
                  <p className="whitespace-pre-line">{operator.name || "—"}</p>
                  <p className="whitespace-pre-line">{operator.address || "—"}</p>
                </section>
                <section aria-labelledby="kontakt">
                  <h2 id="kontakt" className="mb-1 font-medium text-ink">Kontakt</h2>
                  <p>
                    E-Mail:{" "}
                    {operator.email ? (
                      <a className="underline hover:text-ink" href={`mailto:${operator.email}`}>
                        {operator.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </p>
                  {operator.phone ? <p>Telefon: {operator.phone}</p> : null}
                </section>
                <section aria-labelledby="haftung">
                  <h2 id="haftung" className="mb-1 font-medium text-ink">Hinweis zum Angebot</h2>
                  <p>
                    Markenfrei ist eine Vorprüfung und keine Rechtsberatung. Die Ergebnisse stammen von Diensten
                    Dritter. Markenregister werden nicht abgefragt; ob ein Name als Marke frei ist, muss vor der Nutzung
                    selbst oder durch eine fachkundige Person geprüft werden.
                  </p>
                </section>
                <section aria-labelledby="haftungsausschluss">
                  <h2 id="haftungsausschluss" className="mb-1 font-medium text-ink">Haftung und Gewährleistung</h2>
                  <p>
                    Markenfrei ist ein kostenloses, privat betriebenes Open-Source-Projekt und wird wie besehen
                    bereitgestellt. Es wird keine Gewährleistung für Richtigkeit, Vollständigkeit, Aktualität und
                    ständige Verfügbarkeit übernommen. Für Schäden, die aus der Nutzung der Ergebnisse entstehen, etwa
                    bei der Wahl eines Namens, einer Markenanmeldung oder einem Domainkauf, wird nicht gehaftet.
                  </p>
                  <p className="mt-2">
                    Unberührt bleibt die Haftung bei Vorsatz und grober Fahrlässigkeit, bei der Verletzung von Leben,
                    Körper oder Gesundheit sowie nach zwingenden gesetzlichen Vorschriften.
                  </p>
                </section>
              </div>
            </>
          )}
        </WithOperator>
      </Suspense>
    </div>
  );
}
