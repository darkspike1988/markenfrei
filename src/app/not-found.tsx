import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Seite nicht gefunden",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="pt-10 sm:pt-16">
      <p className="stamp stamp-md bg-warn-bg text-warn">404 · nicht gefunden</p>
      <h1 className="display mt-6 text-[2.6rem] text-ink sm:text-6xl">Seite nicht gefunden</h1>
      <div className="mt-5 max-w-2xl space-y-3 text-soft sm:text-lg">
        <p>Diese Adresse gibt es bei Markenfrei nicht. Vielleicht ist der Link veraltet oder falsch geschrieben.</p>
      </div>
      <div className="mt-8 flex flex-wrap gap-2">
        <Link href="/" className="btn btn-primary">
          Zur Startseite: Namen prüfen
        </Link>
        <Link href="/quellen" className="btn btn-secondary">
          Quellen ansehen
        </Link>
      </div>
    </div>
  );
}
