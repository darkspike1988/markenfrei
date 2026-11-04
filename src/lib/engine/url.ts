/**
 * Links in Ergebnissen stammen teils aus Antworten Dritter (z. B. trackViewUrl des App Stores).
 * Nur http und https ohne Zugangsdaten dürfen in die Oberfläche und in MCP-Antworten, sonst
 * ließe sich über eine manipulierte Antwort ein javascript:- oder data:-Link einschleusen.
 */
export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return undefined;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
  if (u.username || u.password) return undefined;
  return u.toString();
}
