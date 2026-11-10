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

/** Art eines Vergleichstreffers (Ähnlichkeitsquellen). Nur ein Hinweis, kein Rechtsbefund. */
export type MatchKind = "gleich" | "klanggleich" | "schreibaehnlich" | "enthalten";

export const MATCH_KINDS = ["gleich", "klanggleich", "schreibaehnlich", "enthalten"] as const satisfies readonly MatchKind[];

/** Ein Vergleichstreffer einer Ähnlichkeitsquelle (höchstens MAX_MATCHES je Quelle). */
export type SourceMatch = { label: string; kind: MatchKind; id?: string };

export const MAX_MATCHES = 5;

/** Registrierungs-Link des Betreibers zu einer Domain (src/lib/register.ts). */
export type RegisterLink = { label: string; url: string; notice: string };

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
  /**
   * Optional und additiv: die Vergleichstreffer hinter einem "similar"/"taken" einer Ähnlichkeitsquelle
   * (höchstens 5). Nur ein Hinweis, kein Rechtsbefund; ein fehlender Treffer ist keine Freigabe.
   */
  matches?: SourceMatch[];
  /**
   * Optional und additiv: Link zum Registrierungsdienst des Betreibers. Nur an Domain-Zeilen einzeln
   * geprüfter Endungen mit "not_found" und nur, wenn der Betreiber den Dienst eingestellt hat. Ein
   * eigenes, möglicherweise vergütetes Angebot des Betreibers, keine Zusage, dass die Domain bestellbar ist.
   */
  register?: RegisterLink;
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
  /** Umgang mit Weiterleitungen, Standard "follow". Mit "manual" kommt die 3xx-Antwort selbst zurück. */
  redirect?: "follow" | "manual";
};

export type HttpResponse = {
  /** HTTP-Status, 0 bei Fehler ohne Antwort */
  status: number;
  headers: Headers;
  json?: unknown;
  text?: string;
  /**
   * Gesetzt, wenn keine verwertbare Antwort kam.
   * "budget": das Abfragebudget des Zieldienstes ist ausgeschöpft (siehe HOST_BUDGETS in http.ts), der
   * nächste freie Platz ist aber bald frei; eine Wiederholung in einigen Sekunden lohnt sich.
   * "budget_long": ausgeschöpft, und der nächste freie Platz liegt weit weg (Stunden- oder Tagesfenster,
   * siehe LONG_BUDGET_WAIT_MS); eine baldige Wiederholung hilft nicht.
   * In beiden Fällen wurde keine Anfrage gesendet, das Ergebnis ist "unknown".
   */
  error?: "timeout" | "network" | "deadline" | "too_large" | "parse" | "budget" | "budget_long";
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
