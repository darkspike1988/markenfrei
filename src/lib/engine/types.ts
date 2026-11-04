/**
 * Vertrag für alle Quellen der Namensprüfung (siehe docs/v2-spec.md).
 */

export type Status = "taken" | "not_found" | "similar" | "invalid" | "unknown";

export type Namespace = "domains" | "packages" | "stores" | "social" | "known_names";

export const NAMESPACES: readonly Namespace[] = [
  "domains",
  "packages",
  "stores",
  "social",
  "known_names",
];

export const NAMESPACE_LABEL: Record<Namespace, string> = {
  domains: "Domains",
  packages: "Pakete",
  stores: "App Stores",
  social: "Social",
  known_names: "Bekannte Namen",
};

export type SourceResult = {
  /** Stabile ID der Quelle, z. B. "npm" oder "rdap:de" */
  sourceId: string;
  namespace: Namespace;
  /** Anzeigename, z. B. "npm" oder ".de" */
  label: string;
  /** Was geprüft wurde, z. B. "wachwerk.de" oder "wachwerk" */
  target: string;
  status: Status;
  /** Link zum manuellen Nachprüfen */
  url?: string;
  /** Kurzer deutscher Hinweis, z. B. "Ähnlichkeitsregel von npm möglich" */
  note?: string;
  /** Technischer Beleg, z. B. "HTTP 404" */
  evidence?: string;
  /** Schwaches Signal: ein Treffer ergibt höchstens Gelb, nie Rot */
  weak?: boolean;
  /**
   * Nur bei "unknown": Der Grund ist vorübergehend (Abfragebudget, Zeitüberschreitung, Rate-Limit),
   * eine erneute Prüfung in einigen Sekunden hat gute Aussichten. Eindeutige Quellen kommen dabei aus
   * dem Zwischenspeicher, es werden nur diese offenen Quellen neu abgefragt.
   */
  retryable?: boolean;
};

export type HttpRequest = {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  /** Wie der Körper gelesen wird. "none" verwirft ihn ungelesen. Standard "none". */
  read?: "json" | "text" | "none";
  /** Höchstens so viele Bytes lesen, Standard 512 KB. Mehr bricht ab (error "too_large"). */
  maxBytes?: number;
  /** Timeout dieser Anfrage in ms, Standard 5000, nie länger als die Deadline */
  timeoutMs?: number;
  /**
   * Einmal wiederholen bei Timeout, Netzfehler oder 429/502/503/504, solange die Deadline noch
   * mindestens eine Sekunde lässt. Nur für Abfragen ohne Nebenwirkung (alle sind GET oder HEAD).
   */
  retry?: boolean;
};

export type HttpResponse = {
  /** HTTP-Status, 0 bei Fehler ohne Antwort */
  status: number;
  headers: Headers;
  json?: unknown;
  text?: string;
  /** Gesetzt, wenn keine verwertbare Antwort kam */
  /**
   * "budget": das Abfragebudget des Zieldienstes ist ausgeschöpft (siehe HOST_BUDGETS in http.ts).
   * Es wurde keine Anfrage gesendet, das Ergebnis ist "unknown".
   */
  error?: "timeout" | "network" | "deadline" | "too_large" | "parse" | "budget";
};

export type HttpClient = {
  request(url: string, req?: HttpRequest): Promise<HttpResponse>;
};

export type CheckContext = {
  http: HttpClient;
  /** Kontakt für den User-Agent (MARKENFREI_CONTACT), leer wenn nicht gesetzt */
  contact: string;
};

export type Source = {
  id: string;
  namespace: Namespace;
  label: string;
  /** Teil der Standardauswahl (Web und MCP gleich) */
  defaultEnabled: boolean;
  /** Kurzbeschreibung für /quellen und MCP */
  description: string;
  /** Endpunkt-Vorlage zur Dokumentation, z. B. "https://registry.npmjs.org/{name}" */
  endpoint: string;
  check(name: string, ctx: CheckContext): Promise<SourceResult>;
};
