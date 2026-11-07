# Markenregister: Was ist maschinell abfragbar?

Stand der Prüfung: 4. November 2026. Frage: Kann Markenfrei ein Markenregister ohne
Schlüssel und ohne Vertrag live abfragen? **Ergebnis: Nein, bei keiner geprüften Quelle.**
Markenfrei verlinkt die Register deshalb zur manuellen Recherche und prüft sie nicht.

Gelesen wurde nur, was die Anbieter öffentlich zeigen. "Nicht geprüft" heißt: Der Zugriff
war in dieser Prüfung nicht möglich oder die Aussage ist nicht belegt.

| Quelle | Maschinenzugang | Beleg | Befund |
|---|---|---|---|
| **DPMAregister** (Deutschland) | Nein, nicht frei | Seite "Markenrecherche" und "Datenabgabe" des DPMA (Stand 10.12.2025) | Web-Recherche kostenlos, aber nur manuell und **ohne Ähnlichkeitssuche**. Maschinenlesbare Daten über **DPMAconnectPlus** auf Grundlage einer vertraglichen Regelung gegen Erstattung der Bereitstellungskosten. |
| **EUIPO** (Unionsmarken) | Nur mit Registrierung | `dev.euipo.europa.eu` (API-Portal) | Zugang über ein Konto und Freischaltung für die Sandbox. Nicht schlüsselfrei. |
| **USPTO** (USA) | Nur mit API-Schlüssel | `tsdrapi.uspto.gov` antwortet mit 401 und dem Hinweis, sich für einen API-Schlüssel zu registrieren | Nicht schlüsselfrei. |
| **TMview** (EUIPO, viele Ämter) | Nicht geprüft | Der geprüfte API-Pfad war nicht erreichbar | Kein belegter offener Zugang. |
| **WIPO Global Brand Database** | Nicht geprüft | `api.branddb.wipo.int` antwortete mit 403 | Kein belegter offener Zugang. |
| **TMDB** (`tmdb.eu`) | Nein | Siehe unten | Suche für Menschen kostenlos, keine Schnittstelle, Bot-Abwehr aktiv. |

## TMDB im Detail

- Betreiber laut Nutzungsbedingungen: IP Central GmbH. Rechtsdienstleistungen erbringt die
  Kanzlei Breuer Lehmann (München). Datenquellen laut Nutzungsbedingungen: EUIPO, DPMA,
  Schweizer IGE, WIPO und USPTO. Die Seite schließt jede Gewähr für Richtigkeit,
  Vollständigkeit und Aktualität aus.
- Die Suche ist eine serverseitig erzeugte Seite:
  `GET /de/suche/marken?q=<Begriff>&office=&status=&mode[]=fts`. Die Aufzeichnung der
  Netzwerkaufrufe zeigt keinen JSON-Endpunkt. In der Oberfläche war ein Standardfilter
  "Zeitraum 2025 bis 2026" aktiv. Ob er die Trefferliste im Test beeinflusst hat, wurde
  nicht geprüft. Eine leere Liste ist deshalb **kein** Beleg für einen freien Namen.
- Automatisierte Clients werden mit einer **Cloudflare-Challenge** (Turnstile) abgewiesen:
  `curl` und ein automatisierter Chromium (über REA gestartet) erhielten HTTP 403 und die
  Seite "Nur einen Moment…". Ein normaler Browser lud die Seite ohne Hürde.
- `robots.txt` erlaubt das Crawlen außer `/inhaber/` und `/owner/`. Die Nutzungsbedingungen
  nennen weder eine Schnittstelle noch eine Erlaubnis für automatisierte Abfragen.

**Entscheidung:** Markenfrei fragt TMDB nicht automatisiert ab und versucht nicht, die
Bot-Abwehr zu umgehen. Der Bericht enthält nur einen Link zur Suche: einen Eintrag in
`trademark.links` mit `office: "TMDB"`, den Menschen selbst öffnen.

## Folgen für das Produkt

- Die Ampel entsteht aus Domains, Paketregistern, App Stores und bekannten Namen. Standard
  bei den bekannten Namen sind die Quelle `known_brands` (Heuristik ohne Netz mit 89
  bekannten Tech-Marken), Wikidata und GLEIF. Wikipedia und Show HN laufen nur auf Wunsch und
  zählen als schwache Signale: Ein Treffer ergibt dort höchstens Gelb. Markenregister gehen
  nicht in die Ampel ein, die Marke steht immer auf „nicht geprüft“. **Die Ampel ersetzt
  keine Registerrecherche.** Texte in der Oberfläche und in der MCP-Beschreibung sagen das.
- Die Quelle `wikidata_brands` (nur auf Wunsch) vergleicht ohne Netz gegen einen Schnappschuss
  von Marken aus Wikidata (CC0, mit Abrufdatum im Dateikopf, von Hand erneuert). Die Liste ist
  unvollständig, weil viele bekannte Marken in Wikidata nicht als Marke geführt sind; ein
  Treffer ergibt höchstens Gelb, ein fehlender Treffer ist keine Freigabe.
- Ähnlichkeitsrecherchen (Klang, Schrift, Bild) bieten die Ämter selbst nicht kostenlos an
  (Hinweis des DPMA). Kommerzielle Recherchedienste oder eine anwaltliche Prüfung bleiben
  der Weg vor einer Anmeldung.
- **Offene Entscheidung für den Betreiber:** EUIPO (kostenlose Registrierung für die Sandbox)
  und USPTO (API-Schlüssel) wären die einzigen Wege zu einer echten Live-Abfrage. Das
  widerspräche dem Grundsatz "keine Schlüssel", ließe sich aber als optionale Quelle
  umsetzen: nur aktiv, wenn der Betreiber einen eigenen Schlüssel setzt. Dazu müssten die
  Nutzungsbedingungen beider Programme gelesen und die Antworten gegen bekannte Marken
  getestet werden. Das ist hier nicht geschehen.
