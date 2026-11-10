/**
 * Registrierungs-Link des Betreibers für Domains (rein, ohne Netz).
 *
 * Der Betreiber kann einen eigenen Dienst zum Bestellen von Domains verlinken. Markenfrei überträgt
 * nichts an diesen Dienst: Der Domainname steht nur im Link, den der Nutzer selbst öffnet. Fehlt die
 * Einstellung oder ist sie unvollständig oder ungültig, gibt es nirgends einen Link; eine Ausnahme
 * entsteht dabei nie.
 */

import type { RegisterLink } from "@/lib/engine/types";

export type { RegisterLink };

/** Eingestellter Dienst: Anzeigename und Link-Vorlage mit `{domain}` (optional `{name}`, `{tld}`). */
export type RegisterService = { name: string; urlTemplate: string };

export const REGISTER_NAME_MAX = 60;
const TEMPLATE_MAX = 2000;

/** Fester Hinweis an jedem Link. */
export const REGISTER_NOTICE =
  "Angebot des Betreibers dieser Seite; er kann dafür eine Vergütung erhalten. „Nicht gefunden“ ist keine Zusage, dass die Domain bestellbar ist.";

const PLACEHOLDER = /\{(domain|name|tld)\}/g;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

function fill(template: string, values: Record<"domain" | "name" | "tld", string>): string {
  return template.replace(PLACEHOLDER, (_, key: "domain" | "name" | "tld") => encodeURIComponent(values[key]));
}

/**
 * Gültige Vorlage: https, `{domain}` enthalten, nur bekannte Platzhalter, keine Platzhalter im Host,
 * keine Zugangsdaten, keine Leer- oder Steuerzeichen.
 */
function validTemplate(template: string): boolean {
  if (template.length > TEMPLATE_MAX || !template.startsWith("https://")) return false;
  if (/\s/.test(template) || CONTROL.test(template)) return false;
  if (!template.includes("{domain}")) return false;
  if (/[{}]/.test(template.replace(PLACEHOLDER, ""))) return false;
  const authority = template.slice("https://".length).split(/[/?#]/)[0];
  if (authority.includes("{")) return false;
  try {
    const u = new URL(fill(template, { domain: "beispiel.de", name: "beispiel", tld: "de" }));
    return u.protocol === "https:" && u.hostname !== "" && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}

/**
 * Liest MARKENFREI_REGISTER_URL und MARKENFREI_REGISTER_NAME. null, wenn nicht eingestellt oder
 * ungültig (dann gibt es nirgends einen Link).
 */
export function registerConfigFromEnv(env: Record<string, string | undefined> = process.env): RegisterService | null {
  const urlTemplate = (env.MARKENFREI_REGISTER_URL ?? "").trim();
  const name = (env.MARKENFREI_REGISTER_NAME ?? "").trim();
  if (!urlTemplate || !name) return null;
  if (name.length > REGISTER_NAME_MAX || CONTROL.test(name)) return null;
  if (!validTemplate(urlTemplate)) return null;
  return { name, urlTemplate };
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Syntaktisch gültiger Hostname aus mindestens zwei Labels, Endung nicht nur aus Ziffern. */
export function isHostName(domain: string): boolean {
  if (domain.length > 253) return false;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return false;
  return !/^\d+$/.test(labels[labels.length - 1]);
}

/**
 * Link zum Dienst für eine Domain, z. B. „wachwerk.de“. null bei ungültigem Hostnamen.
 * `{name}` ist das erste Label, `{tld}` der Rest; alle Werte werden URL-kodiert eingesetzt.
 */
export function registerLink(service: RegisterService, domain: string): RegisterLink | null {
  const host = String(domain ?? "").trim().toLowerCase();
  if (!isHostName(host)) return null;
  const dot = host.indexOf(".");
  try {
    const url = new URL(fill(service.urlTemplate, { domain: host, name: host.slice(0, dot), tld: host.slice(dot + 1) }));
    if (url.protocol !== "https:") return null;
    return { label: `Registrieren über ${service.name}`, url: url.href, notice: REGISTER_NOTICE };
  } catch {
    return null;
  }
}
