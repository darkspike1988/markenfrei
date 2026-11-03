import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MarkenFrei · KI & Open-Data App-Namensfinder mit Marken- & Domain-Prüfung",
  description:
    "Finde rechtssichere, unbelastete Namen für Apps, SaaS & Webseiten per Multi-Provider-LLM, OpenThesaurus, Datamuse, RDAP/DNS, Kölner Phonetik, Wikidata, Apple App Store & DPMA/EUIPO-Check.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[#0b0e17] text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-200">
        {children}
      </body>
    </html>
  );
}
