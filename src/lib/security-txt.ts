import { operatorFromEnv } from "@/lib/legal";
import { publicUrl } from "@/lib/site";

/** Gültigkeit der security.txt ab Abruf (RFC 9116 verlangt ein Ablaufdatum, empfiehlt unter einem Jahr). */
export const SECURITY_TXT_VALID_DAYS = 180;

/** RFC 3339, UTC, ohne Millisekunden. */
const rfc3339 = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Text der security.txt nach RFC 9116. Reine Funktion: Adresse, Basis-URL und Zeitpunkt kommen
 * von außen. Die Adresse muss vorher geprüft sein (siehe securityTxtFromEnv).
 */
export function buildSecurityTxt(email: string, origin: string, now: Date = new Date()): string {
  const expires = new Date(now.getTime() + SECURITY_TXT_VALID_DAYS * 24 * 60 * 60 * 1000);
  return (
    [
      `Contact: mailto:${email}`,
      `Expires: ${rfc3339(expires)}`,
      "Preferred-Languages: de, en",
      `Canonical: ${origin}/.well-known/security.txt`,
    ].join("\n") + "\n"
  );
}

/**
 * Liest die Adresse mit derselben Prüfung wie das Impressum (operatorFromEnv). Ohne gültige
 * Adresse null: dann gibt es keine security.txt, es wird nichts erfunden.
 */
export function securityTxtFromEnv(
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): string | null {
  const check = operatorFromEnv(env);
  if (check.missing.includes("MARKENFREI_OPERATOR_EMAIL")) return null;
  return buildSecurityTxt(check.operator.email, publicUrl(env).origin, now);
}
