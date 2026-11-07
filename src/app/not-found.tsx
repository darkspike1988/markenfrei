import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Seite nicht gefunden",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="pt-8 sm:pt-14">
      <h1 className="font-serif text-4xl leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">
        Seite nicht gefunden
      </h1>
      <div className="mt-4 max-w-2xl space-y-3 text-soft">
        <p>Diese Adresse gibt es bei Markenfrei nicht. Vielleicht ist der Link veraltet oder falsch geschrieben.</p>
      </div>
      <ul className="mt-6 space-y-2 text-sm">
        <li>
          <Link href="/" className="underline hover:text-ink">
            Zur Startseite: Namen prüfen
          </Link>
        </li>
        <li>
          <Link href="/quellen" className="underline hover:text-ink">
            Quellen ansehen
          </Link>
        </li>
      </ul>
    </div>
  );
}
