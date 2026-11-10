import { CopyButton } from "@/components/copy-button";

/**
 * Codeblock mit Beschriftung und Kopieren-Knopf (Server-Komponente, nur der Knopf läuft im Browser).
 * Der scrollbare Block ist fokussierbar, damit er sich per Tastatur lesen lässt (WCAG 2.1.1, axe: scrollable-region-focusable).
 */
export function CodeBlock({ text, label }: { text: string; label: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-wash/60 py-1 pl-4 pr-1.5">
        <span className="eyebrow">{label}</span>
        <CopyButton text={text} />
      </div>
      <pre tabIndex={0} role="region" aria-label={label} className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-relaxed text-ink">
        <code>{text}</code>
      </pre>
    </div>
  );
}
