import { CopyButton } from "@/components/copy-button";

/**
 * Codeblock mit Beschriftung und Kopieren-Knopf (Server-Komponente, nur der Knopf läuft im Browser).
 * Der scrollbare Block ist fokussierbar, damit er sich per Tastatur lesen lässt (WCAG 2.1.1, axe: scrollable-region-focusable).
 */
export function CodeBlock({ text, label }: { text: string; label: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 px-3 pt-2">
        <span className="text-xs text-muted">{label}</span>
        <CopyButton text={text} />
      </div>
      <pre tabIndex={0} role="region" aria-label={label} className="overflow-x-auto px-3 pb-3 pt-1.5 font-mono text-[13px] leading-relaxed text-ink">
        <code>{text}</code>
      </pre>
    </div>
  );
}
