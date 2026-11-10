import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PageviewBeacon } from "@/components/pageview-beacon";
import { publicUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/site";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Displayschrift für Überschriften: variable Achsen für optische Größe, Weichheit und die eigenwilligen Kursivformen.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
});

export const metadata: Metadata = {
  metadataBase: publicUrl(),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Relativ zur aufgerufenen Seite, ohne Query: ?q=… erzeugt keine eigene Adresse in Suchmaschinen.
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "de_DE",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5ef" },
    { media: "(prefers-color-scheme: dark)", color: "#131311" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: Das Skript im Kopf setzt data-theme vor der Hydrierung (gewählte Darstellung).
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Gewählte Darstellung vor dem ersten Zeichnen anwenden, ohne Aufblitzen (siehe lib/theme.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Browser-Suche: „Markenfrei hinzufügen“. Die Metadata-API kennt rel="search" nicht. */}
        <link rel="search" type="application/opensearchdescription+xml" title={SITE_NAME} href="/opensearch.xml" />
      </head>
      <body className="flex min-h-dvh flex-col text-ink">
        <div aria-hidden className="backdrop" />
        <a
          href="#inhalt"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-30 focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
        >
          Zum Inhalt
        </a>
        <SiteHeader />
        <main id="inhalt" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 sm:px-6">
          {children}
        </main>
        <SiteFooter />
        <PageviewBeacon />
      </body>
    </html>
  );
}
