# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [Unveröffentlicht]

### Hinzugefügt

- Ergebnisseite grafisch aufbereitet: großes Urteilsfeld oben in jeder Berichtskarte (Ampelfarbe, Symbol und Text, ein Satz aus den vorhandenen Texten, Zählung der Quellen) mit einem gegliederten Balken nach Anzahl der Quellen (unbekannt und nicht zulässig schraffiert, jedes Segment mit Text im Label). Keine Prozente, kein Punktwert.
- Ähnliche Marken als Zeilen: neues optionales, additives Feld `SourceResult.matches` (`{ label, kind, id? }`, bis zu 5, `kind` = gleich, klanggleich, schreibaehnlich, enthalten) in `wikidata_brands` und `known_brands`; `schemaVersion` bleibt 2, `note` und `evidence` unverändert. Die Oberfläche zeigt je Treffer Art-Chip (Symbol und Wort) und die übereinstimmenden Buchstaben hervorgehoben (`src/lib/match-highlight.ts`), mit dem Hinweis, dass Ähnlichkeit kein Rechtsbefund und kein Treffer keine Freigabe ist.

- Einmalige Wiederholung für flüchtige Fehler: Der HTTP-Client kennt `retry` bereits; die direkten Abfragen der Quellen (npm, PyPI, NuGet, pub.dev, JSR, Hex.pm, Open VSX, crates-Sparse-Index, Homebrew, RubyGems, Maven, Packagist, CRAN, Wikipedia, HN, AUR, Repology, ecosyste.ms, F-Droid, Firefox Add-ons, Bluesky, Mastodon, RDAP und IANA-Bootstrap) setzen es jetzt auch. Ausgenommen bleiben Quellen mit eigener Ausfall-Logik (GitHub-Rate-Limit, App Store, Google Play) und DNS über HTTPS (eigener Anbieter-Rückfall). Spürbare Ausfälle (Timeout, Netzfehler, 429/502/503/504) ergeben dadurch seltener „unbekannt“.
- Wöchentlicher Workflow `update-snapshots.yml`: erneuert `rdap-tlds.json` und `wikidata-brands.json` und öffnet bei Änderungen automatisch einen Pull Request.
- Die wöchentliche Live-Probe legt bei einem Ausfall automatisch ein Issue an (oder ergänzt ein offenes) und verlinkt den Lauf; die Status-Datei bleibt unverändert Artefakt.
- Firmenregister in der Recherche-Vorbereitung: `trademark.links` verlinkt jetzt Zefix (Schweizer Handelsregister) und handelsregister.de (Gemeinsames Registerportal), beide ohne nachweisbares Vorausfüllen mit dem Hinweis, den Namen selbst einzutragen. Neue Grenze „Keine Firmenregister-Abfrage“ mit Begründung in `docs/companies-register.md` (Zefix-REST braucht Konto und sperrt robots.txt, LINDAS-SPARQL 7,1 s über dem Zeitbudget, Schnappschuss mit 123.845 einwortigen Namensstämmen über der Bundle-Grenze, handelsregister.de verbietet automatisierte Abfragen, Firmenbuch braucht Konto).
- Neue Quellen im Namensraum „Pakete“ (alle nur auf Wunsch, ohne Schlüssel): Chocolatey und PowerShell Gallery (beide NuGet-v2-Feed `FindPackagesById`, 200 mit `<entry>` je Version gilt als vergeben, ohne als nicht gefunden; zu große Antwort gilt als vergeben, weil sie viele Versionen bedeutet) sowie Launchpad (Projekt `{name}` und Nutzer `~{name}`, beide Adressen werden geprüft). Endpunkte live gegengeprüft am 9. November 2026 mit `git`/`pester`/`ubuntu` und `zzqxkvjwabc`; Kanariennamen in der wöchentlichen Live-Probe ergänzt. GitLab und Codeberg wurden geprüft, aber nicht aufgenommen: ihre robots.txt sperrt `/api/v*` bzw. `/api/`.
- Neue Quelle `wikidata_brands` (Namensraum „Bekannte Namen“, nur auf Wunsch): Ähnlichkeitsvergleich ohne Netz gegen einen Schnappschuss von Wikidata-Marken (CC0, `wikidata-brands.json`, Stand und Anzahl im Dateikopf). Treffer ergeben höchstens „ähnlich“ (nie „vergeben“), ein fehlender Treffer „nicht gefunden“ mit dem Hinweis, dass die Liste unvollständig und keine Freigabe ist; fehlt oder bricht der Schnappschuss, ergibt die Quelle „unbekannt“. Nur auf dem Server, nicht im Browser-Bundle (neuer Test `client-bundle-boundary`).
- Die wöchentliche Live-Probe schreibt mit `--json` eine `probe-status.json` (je Quelle nur ok/Warnung/Fehler, ohne Notizen und Namen) und lädt sie als Artefakt hoch.
- Kommandozeile `npm run cli -- check <name…>` (Text oder `--json`, `--namespaces`, `--tlds`, `--sources`) auf derselben Engine wie Web und MCP. Exit-Code nach der Ampel (0 grün, 1 gelb, 2 rot, bei mehreren Namen die schlechteste; 64 Aufruffehler, 70 interner Fehler). Kein `bin`-Eintrag und keine Veröffentlichung. Budgets gelten nur je Prozess, deshalb nicht in Schleifen aufrufen.
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

- `matchKnownBrands` und `containsAtBoundary` liegen jetzt in `src/lib/brand-match.ts` (`known-names.ts` re-exportiert sie); `insights.ts` importiert von dort und erreicht damit keine Quellen mehr.
- Die Textformatierer (`formatReport`, `formatRanking`, `prepareShortlist`, `effectiveSources`) liegen jetzt in `src/lib/engine/format.ts` ohne MCP-SDK; der Hinweis am Ende ist ein Parameter, die MCP-Texte bleiben unverändert.
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
