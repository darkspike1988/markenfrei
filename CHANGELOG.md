# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [Unveröffentlicht]

### Hinzugefügt

- Erinnerung als .ics: Ein Klick lädt einen ganztägigen Kalendertermin „Name erneut prüfen“ in 30 Tagen herunter, erzeugt nur im Browser.
- Mehr Endungen über RDAP: Alle Endungen mit RDAP-Server im IANA-Bootstrap sind wählbar (Schnappschuss `src/lib/engine/sources/rdap-tlds.json`, von Hand erneuert mit `scripts/update-rdap-tlds.ts`, nicht im Build, nicht in CI). Die Oberfläche zeigt weiter die 33 bisherigen Endungen als Chips; weitere findet man über ein Suchfeld, höchstens 8 je Prüfung.
- Nur die bisherigen 33 Endungen sind einzeln geprüft. Bei allen anderen ergibt RDAP-404 nie „nicht gefunden“, sondern „unbekannt“ mit dem Hinweis, beim Registrar zu bestätigen; RDAP-200 gilt weiter als „vergeben“.
- `GET /api/sources` kennzeichnet jede Endung mit `checked` (einzeln geprüft oder nicht).
- crates.io wird über den Sparse-Index abgefragt.
- `GET /api/sources` und `GET /llms.txt`.
- Browser-Suche: `GET /opensearch.xml` (OpenSearch-Beschreibung), `<link rel="search">` auf jeder Seite; Markenfrei lässt sich als Suchmaschine hinzufügen und öffnet dann `/?q=…`.
- `RateLimit`-Header (Limit, Remaining, Reset) bei `/api/check` und `/api/mcp`, auch bei 429.
- Playwright-E2E-Tests mit axe, eine Live-Probe und Dependabot.
- Deutsche Fehlerseiten (404, Segmentfehler, globaler Fehler).
- `/.well-known/security.txt` nach RFC 9116, nur wenn `MARKENFREI_OPERATOR_EMAIL` gesetzt und gültig ist (sonst 404); nicht in der Sitemap.

### Geändert

- Fällt der IANA-Bootstrap zur Laufzeit aus, dient der Schnappschuss als Rückfall (vorher nur die festen Server für `.de`, `.io`, `.ch`, `.li`).
- OpenAPI und MCP-Schema zählen die Endungen nicht mehr auf (Muster, Verweis auf `/api/sources`); die Fehlermeldung bei einer unbekannten Endung nennt nicht mehr alle Endungen. Ungültige Endungen ergeben im MCP weiterhin `isError`.
- `foo.bar` wird zu `foo` (die Endung wird abgetrennt, wenn sie in der Liste steht) statt zu einer Fehlermeldung.
- Die Prüfoberfläche ist in Formular, Prüflauf-Hook und Ergebnisbereich aufgeteilt.
- `npm audit` läuft über alle Abhängigkeiten; `minimatch` in `typescript-estree` auf eine gepatchte Version angehoben (GHSA-g3hv-75wg-m249).
- Betriebsangaben in der Dokumentation angeglichen.
- Der .ics-Export wird nicht mehr gezählt.

### Behoben

- Eine fehlgeschlagene Wiederholung ersetzt keinen fertigen Bericht mehr.
- Kontaktversand läuft wieder auf Node 20 (`Promise.withResolvers` ersetzt).
- Die Live-Probe schlägt bei Fehlern fehl (pipefail); der NuGet-Kanarienname ist jetzt `serilog` (`newtonsoft-json` gibt es dort nicht, die ID lautet `Newtonsoft.Json`).
- Dokumentation: Ampel-Regel an `verdict.ts` angeglichen, falsche Zusage „Link zu jeder Quelle“ entfernt, `llms.txt` ohne falsche Zusagen.

## [2.0.0]

Erste Fassung von v2: 30 Quellen, Ampel ohne Punktwert, API und MCP-Server.
