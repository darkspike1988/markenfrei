/**
 * Betreiberangaben für Impressum und Datenschutzerklärung.
 *
 * Die Angaben stehen nicht im Repository, sondern kommen zur Laufzeit aus der Umgebung des
 * Betreibers. Fehlen Pflichtangaben, zeigen die Seiten das sichtbar an, statt etwas zu erfinden.
 */

export type Operator = {
  name: string;
  /** Mehrzeilig, Zeilen durch \n getrennt */
  address: string;
  email: string;
  phone: string;
  /** Hosting-Anbieter für die Datenschutzerklärung */
  hosting: string;
};

export type OperatorCheck = {
  operator: Operator;
  /** Namen der fehlenden Pflichtvariablen */
  missing: string[];
  complete: boolean;
};

const clean = (v: string | undefined) => (v ?? "").replace(/\r/g, "").trim();

export function operatorFromEnv(env: Record<string, string | undefined> = process.env): OperatorCheck {
  const operator: Operator = {
    name: clean(env.MARKENFREI_OPERATOR_NAME),
    // \n aus .env-Dateien und Compose als Zeilenumbruch lesen
    address: clean(env.MARKENFREI_OPERATOR_ADDRESS).replace(/\\n/g, "\n"),
    email: clean(env.MARKENFREI_OPERATOR_EMAIL),
    phone: clean(env.MARKENFREI_OPERATOR_PHONE),
    hosting: clean(env.MARKENFREI_HOSTING_PROVIDER),
  };
  const missing: string[] = [];
  if (!operator.name) missing.push("MARKENFREI_OPERATOR_NAME");
  if (!operator.address) missing.push("MARKENFREI_OPERATOR_ADDRESS");
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(operator.email)) missing.push("MARKENFREI_OPERATOR_EMAIL");
  if (!operator.hosting) missing.push("MARKENFREI_HOSTING_PROVIDER");
  return { operator, missing, complete: missing.length === 0 };
}
