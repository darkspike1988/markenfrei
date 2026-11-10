import Link from "next/link";
import { SignalMark } from "@/components/signal-mark";
import { SiteNav } from "@/components/site-nav";
import { ThemeToggle } from "@/components/theme-toggle";

/** Seitenkopf: bleibt beim Scrollen stehen, halb durchscheinend. Der Signalgeber folgt dem Stand der Prüfung. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/80 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6">
        {/* Unter sm etwas kleiner und enger, ohne den Link „API“: Marke, Navigation und Darstellung passen so auch bei 360 px in eine Zeile. */}
        <Link href="/" className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg text-ink no-underline sm:gap-2.5">
          <SignalMark />
          <span className="whitespace-nowrap font-serif text-[1.15rem] font-medium leading-none tracking-[-0.02em] sm:text-[1.3rem]">
            Markenfrei
          </span>
        </Link>
        <div className="flex shrink-0 items-center sm:gap-1">
          <SiteNav />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
