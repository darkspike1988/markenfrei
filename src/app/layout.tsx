import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: {
    default: "Markenfrei · Namen vorprüfen",
    template: "%s · Markenfrei",
  },
  description:
    "Vorprüfung eines Namens in Domains, Paketregistern, App Stores und bekannten Namen, mit Link zu jeder Quelle. Marken werden nicht geprüft, sondern die Recherche vorbereitet. Keine Rechtsberatung, keine Speicherung von Suchanfragen.",
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
      </body>
    </html>
  );
}
