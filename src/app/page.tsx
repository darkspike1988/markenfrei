import Link from "next/link";
import { Suspense } from "react";
import { CheckerFallback, CheckerFromUrl } from "@/components/checker";
import { buildCheckerConfig } from "@/lib/checker-setup";
import { GUIDES } from "@/lib/guides";
import { webApplicationJsonLd } from "@/lib/structured-data";

/**
 * Startseite. Die Quellenliste wird hier (Server, Buildzeit) zu reinen Daten gemacht,
 * damit der Engine-Code nicht im Client-Bundle landet.
 */
export default function Home() {
  const config = buildCheckerConfig();
  return (
    <div className="pt-8 sm:pt-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: webApplicationJsonLd() }} />
      <div className="mb-8 max-w-2xl sm:mb-10">
        <h1 className="font-serif text-[2.1rem] leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">
          Wo ist der Name schon vergeben?
        </h1>
        <p className="mt-4 text-base text-soft sm:text-lg">
          Domains, Pakete, App Stores und bekannte Namen in einem Durchgang, mit Link zur Quelle, wo es einen gibt.
        </p>
      </div>
      <Suspense fallback={<CheckerFallback config={config} />}>
        <CheckerFromUrl config={config} />
      </Suspense>
      <nav aria-label="Anleitungen" className="mt-10 text-sm text-muted">
        Anleitungen:{" "}
        {GUIDES.map((g, i) => (
          <span key={g.href}>
            {i > 0 && " · "}
            <Link href={g.href} className="whitespace-nowrap underline hover:text-ink">
              {g.nav}
            </Link>
          </span>
        ))}
      </nav>
    </div>
  );
}
