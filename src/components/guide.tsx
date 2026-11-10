import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import type { CheckerConfig } from "@/components/checker-config";
import { CheckerFallback, CheckerFromUrl } from "@/components/checker";
import { GUIDES, type GuidePath } from "@/lib/guides";
import { faqPageJsonLd, type FaqItem } from "@/lib/structured-data";

/** Fließtext-Spalte: gleiche Zeilenlänge wie auf den übrigen Textseiten. */
const PROSE = "max-w-2xl space-y-3 text-soft";

/** Ein Abschnitt mit H2. */
export function GuideSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <h2 id={id} className="mb-3 font-serif text-[1.7rem] leading-tight text-ink">
        {title}
      </h2>
      <div className={PROSE}>{children}</div>
    </section>
  );
}

/** Aufzählung im Stil der Textseiten. */
export function GuideList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-muted">{children}</ul>;
}

/**
 * Rahmen für eine Anleitung: H1, Einstieg, der eingebettete Prüfer, Abschnitte, Grenzen,
 * optional FAQ (mit passendem JSON-LD) und Links zu den übrigen Anleitungen.
 * Die Seite bleibt statisch; der Prüfer liest ?q= wie auf der Startseite.
 */
export function Guide({
  path,
  title,
  lead,
  config,
  limits,
  faq,
  children,
}: {
  path: GuidePath;
  title: string;
  lead: ReactNode;
  config: CheckerConfig;
  limits: ReactNode;
  faq?: readonly FaqItem[];
  children: ReactNode;
}) {
  const others = GUIDES.filter((g) => g.href !== path);
  return (
    <div className="pt-10 sm:pt-16">
      {faq && faq.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqPageJsonLd(faq) }} />
      )}
      <div className="mb-8 max-w-2xl sm:mb-10">
        <h1 className="display text-[2.6rem] text-ink sm:text-6xl">{title}</h1>
        <div className="mt-4 space-y-3 text-base text-soft sm:text-lg">{lead}</div>
      </div>

      <Suspense fallback={<CheckerFallback config={config} />}>
        <CheckerFromUrl config={config} />
      </Suspense>

      {children}

      <section aria-labelledby="grenzen" className="mt-12 rounded-lg border border-line bg-wash px-4 py-5 sm:px-6">
        <h2 id="grenzen" className="mb-3 font-serif text-[1.7rem] leading-tight text-ink">
          Grenzen dieser Prüfung
        </h2>
        <div className={PROSE}>{limits}</div>
      </section>

      {faq && faq.length > 0 && (
        <section aria-labelledby="fragen" className="mt-12">
          <h2 id="fragen" className="mb-3 font-serif text-[1.7rem] leading-tight text-ink">
            Häufige Fragen
          </h2>
          <dl className="max-w-2xl space-y-5">
            {faq.map((item) => (
              <div key={item.q}>
                <dt className="font-medium text-ink">{item.q}</dt>
                <dd className="mt-1 text-soft">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <nav aria-labelledby="weitere" className="mt-12">
        <h2 id="weitere" className="mb-3 font-serif text-[1.7rem] leading-tight text-ink">
          Weitere Anleitungen
        </h2>
        <ul className="max-w-2xl divide-y divide-line border-y border-line">
          {others.map((g) => (
            <li key={g.href} className="py-3">
              <Link href={g.href} className="font-medium text-ink underline">
                {g.title}
              </Link>
              <p className="mt-0.5 text-sm text-muted">{g.blurb}</p>
            </li>
          ))}
          <li className="py-3">
            <Link href="/quellen" className="font-medium text-ink underline">
              Quellen
            </Link>
            <p className="mt-0.5 text-sm text-muted">Alle abgefragten Dienste mit Endpunkt, Signal und Grenzen.</p>
          </li>
        </ul>
      </nav>
    </div>
  );
}
