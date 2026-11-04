import { connection } from "next/server";
import { operatorFromEnv, type OperatorCheck } from "@/lib/legal";

/** Liest die Betreiberangaben zur Laufzeit (nicht beim Build) und reicht sie weiter. */
export async function WithOperator({ children }: { children: (c: OperatorCheck) => React.ReactNode }) {
  await connection();
  return <>{children(operatorFromEnv())}</>;
}

/** Sichtbarer Hinweis, solange Pflichtangaben fehlen. Verhindert einen stillen Livegang. */
export function MissingOperatorNotice({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <div role="alert" className="mt-6 rounded-lg border border-line bg-warn-bg px-4 py-3 text-sm text-warn">
      <p className="font-medium">Betreiberangaben fehlen. Diese Seite darf so nicht öffentlich laufen.</p>
      <p className="mt-1">
        Setze in der Umgebung des Servers:{" "}
        {missing.map((m, i) => (
          <span key={m}>
            <code className="font-mono">{m}</code>
            {i < missing.length - 1 ? ", " : ""}
          </span>
        ))}
        . Siehe README, Abschnitt „Vor dem Livegang“.
      </p>
    </div>
  );
}
