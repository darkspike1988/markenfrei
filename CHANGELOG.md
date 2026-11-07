# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [Unveröffentlicht]

### Hinzugefügt

- Erinnerung als .ics: Ein Klick lädt einen ganztägigen Kalendertermin „Name erneut prüfen“ in 30 Tagen herunter, erzeugt nur im Browser.
- crates.io wird über den Sparse-Index abgefragt.
- `GET /api/sources` und `GET /llms.txt`.
- `RateLimit`-Header (Limit, Remaining, Reset) bei `/api/check` und `/api/mcp`, auch bei 429.
- Playwright-E2E-Tests mit axe, eine Live-Probe und Dependabot.
- Deutsche Fehlerseiten (404, Segmentfehler, globaler Fehler).
- `/.well-known/security.txt` nach RFC 9116, nur wenn `MARKENFREI_OPERATOR_EMAIL` gesetzt und gültig ist (sonst 404); nicht in der Sitemap.

### Geändert

- Die Prüfoberfläche ist in Formular, Prüflauf-Hook und Ergebnisbereich aufgeteilt.
- `npm audit` läuft über alle Abhängigkeiten; `minimatch` in `typescript-estree` auf eine gepatchte Version angehoben (GHSA-g3hv-75wg-m249).
- Betriebsangaben in der Dokumentation angeglichen.

### Behoben

- Eine fehlgeschlagene Wiederholung ersetzt keinen fertigen Bericht mehr.
- Kontaktversand läuft wieder auf Node 20 (`Promise.withResolvers` ersetzt).
- Die Live-Probe schlägt bei Fehlern fehl (pipefail); der NuGet-Kanarienname ist jetzt `serilog` (`newtonsoft-json` gibt es dort nicht, die ID lautet `Newtonsoft.Json`).
- Dokumentation: Ampel-Regel an `verdict.ts` angeglichen, falsche Zusage „Link zu jeder Quelle“ entfernt, `llms.txt` ohne falsche Zusagen.

## [2.0.0]

Erste Fassung von v2: 30 Quellen, Ampel ohne Punktwert, API und MCP-Server.
