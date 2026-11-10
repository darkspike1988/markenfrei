const DATE = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/**
 * Hinweis über den Berichten, wenn dieselbe Auswahl schon einmal geprüft wurde (Verlauf eingeschaltet):
 * je Änderung eine Zeile, sonst eine ruhige Zeile „Keine Änderung“. Als Text, nicht nur als Farbe.
 */
export function ChangesNotice({ at, lines }: { at: string; lines: readonly string[] }) {
  const date = <time dateTime={at}>{DATE.format(new Date(at))}</time>;
  return (
    <div role="status">
      {lines.length === 0 ? (
        <p className="text-sm text-muted">Keine Änderung seit der Prüfung vom {date}.</p>
      ) : (
        <div className="card px-4 py-3 text-sm sm:px-6">
          <p className="font-medium text-ink">Seit der Prüfung vom {date}:</p>
          <ul className="mt-1.5 space-y-0.5 text-soft">
            {lines.map((line) => (
              <li key={line} className="[overflow-wrap:anywhere]">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
