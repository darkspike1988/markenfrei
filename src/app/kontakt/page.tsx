import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ContactForm } from "@/components/contact-form";
import { WithOperator } from "@/components/operator-notice";
import { issueContactToken } from "@/lib/contact-token";
import { mailConfigFromEnv } from "@/lib/mail";

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Schreib dem Betreiber von Markenfrei eine Nachricht.",
};

export default function KontaktPage() {
  return (
    <div className="pt-8 sm:pt-14">
      <h1 className="font-serif text-4xl leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">Kontakt</h1>
      <div className="mt-6 max-w-2xl">
        {/* Feste Mindesthöhe, damit die Seite beim Laden der Betreiberangaben nicht springt */}
        <Suspense fallback={<div className="min-h-[48rem]" aria-hidden />}>
          <WithOperator>
            {({ operator }) => {
              // Ob das Formular angeboten wird, entscheidet die Seite zur Laufzeit, nicht erst der Versand.
              const mail = mailConfigFromEnv();
              if (!mail.configured) {
                if (mail.problem) console.warn(`Kontaktformular ausgeschaltet: ${mail.problem}`);
                return (
                  <p className="text-soft">
                    Das Kontaktformular ist gerade nicht verfügbar.{" "}
                    {operator.email ? (
                      <>
                        Schreib stattdessen eine E-Mail an{" "}
                        <a className="underline hover:text-ink" href={`mailto:${operator.email}`}>
                          {operator.email}
                        </a>
                        .
                      </>
                    ) : (
                      <>
                        Die Kontaktdaten stehen im{" "}
                        <Link href="/impressum" className="underline hover:text-ink">
                          Impressum
                        </Link>
                        .
                      </>
                    )}
                  </p>
                );
              }
              return (
                <>
                  <p className="mb-6 text-soft">
                    Die Nachricht geht per E-Mail an den Betreiber, die Antwort kommt an die Adresse, die du angibst.
                    Was dabei mit deinen Angaben passiert, steht in der{" "}
                    <Link href="/datenschutz#kontakt" className="underline hover:text-ink">
                      Datenschutzerklärung
                    </Link>
                    .
                  </p>
                  <ContactForm token={issueContactToken()} />
                </>
              );
            }}
          </WithOperator>
        </Suspense>
      </div>
    </div>
  );
}
