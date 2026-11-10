/**
 * Signalgeber: drei Lampen im Gehäuse, das Zeichen der Seite. Reine Zierde (aria-hidden); während einer
 * Prüfung laufen die Lampen, danach leuchtet die des Ergebnisses (data-signal an <html>, siehe checker.tsx).
 */
export function SignalMark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`signal ${className}`}>
      <i />
      <i />
      <i />
    </span>
  );
}
