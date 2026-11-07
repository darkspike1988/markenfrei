import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PageviewBeacon } from "@/components/pageview-beacon";
import { publicUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], weight: ["400", "500"] });

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
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#151514" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} antialiased`}>
      {/* Browser-Suche: „Markenfrei hinzufügen“. Die Metadata-API kennt rel="search" nicht; React hebt den Link in den Kopf. */}
      <link rel="search" type="application/opensearchdescription+xml" title={SITE_NAME} href="/opensearch.xml" />
      <body className="flex min-h-dvh flex-col bg-canvas text-ink">
        <a
          href="#inhalt"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-10 focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
        >
          Zum Inhalt
        </a>
        <SiteHeader />
        <main id="inhalt" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 sm:px-6">
          {children}
        </main>
        <SiteFooter />
        <PageviewBeacon />
      </body>
    </html>
  );
}
