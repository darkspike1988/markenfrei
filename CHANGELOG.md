# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [Unveröffentlicht]

### Hinzugefügt

- Für Coding-Agenten: `profile` für `markenfrei_check_name`, `markenfrei_check_names`, `POST /api/check` und die Kommandozeile (`--profile`), z. B. `npm`, `python`, `web-app`. Ausdrückliche `namespaces`, `tlds` oder `sources` ersetzen den jeweiligen Teil; die Kosten fürs Rate-Limit folgen der aufgelösten Auswahl. Server-Anweisungen und Werkzeugbeschreibungen sagen Agenten, wann sie prüfen, welches Profil sie übergeben und wie sie mit dem Ergebnis umgehen. Auf `/mcp` und in `mcp/README.md` steht ein kopierbarer Abschnitt für `AGENTS.md`/`CLAUDE.md` (Deutsch und Englisch).
- Registrierungs-Link des Betreibers für Domains (`MARKENFREI_REGISTER_URL`, `MARKENFREI_REGISTER_NAME`, standardmäßig aus): Domains einzeln geprüfter Endungen mit „nicht gefunden“ tragen dann das Feld `register` mit Beschriftung und dem Hinweis, dass es ein Angebot des Betreibers ist, an dem er verdienen kann. In der Oberfläche steht der Link „registrieren“ neben „prüfen“ (`rel="sponsored"`) mit dem Hinweis „Anzeige: …“; er gilt auch für `/api/check`, beide MCP-Server, den Markdown-Export und die Kommandozeile. Markenfrei überträgt nichts an den Dienst, und Agenten sollen den Link nur weitergeben, nichts bestellen.
- `GET /api/sources` nennt die Profile und ob ein Registrierungsdienst eingestellt ist (nur mit Namen, ohne Link-Vorlage).
- Wiederprüfung mit Vergleich: Ist der Verlauf „Zuletzt geprüft“ eingeschaltet, merkt sich der Browser je Prüfung auch den Status je Quelle. Eine erneute Prüfung derselben Auswahl zeigt über den Berichten, was sich geändert hat („wachwerk · .com: nicht gefunden → vergeben“), oder „Keine Änderung seit der Prüfung vom …“. Ältere Einträge ohne Ergebnis bleiben gültig.
- „Stand kopieren“ in der Werkzeugleiste: kopiert einen Link mit dem Ergebnis im Teil nach `#stand=` (erreicht den Server nie). Wer ihn öffnet, sieht „Stand vom …“ ohne neue Abfrage; „Jetzt neu prüfen“ startet die normale Prüfung. Ein ungültiger Stand wird ignoriert.
- Vorhaben im Prüfer: Allgemein, Web-App, Mobile-App, npm-, Python-, Dart/Flutter-, PHP-, .NET-Paket, Rust-Crate, Ruby-Gem, Java-Bibliothek und Kommandozeile setzen Namensräume, Quellen und Endungen mit einem Klick (`src/lib/profiles.ts`); Standardquellen lassen sich unter „Anpassen“ einzeln abwählen (Link-Parameter `x=`).
- Ausweichnamen im Bericht: bei Treffern oder Lücken bis zu fünf Namen nach festen Mustern, ungeprüft, bis „Ausweichnamen prüfen“ sie zusammen mit dem Original als Shortlist prüft.
- „Übrige geprüfte Endungen ansehen“ in der Gruppe Domains: prüft die übrigen einzeln geprüften Endungen für einen Namen nacheinander nach und ergänzt den Bericht samt Ampel.
- „Hinweise und Belege“: zeigt je Quelle den technischen Beleg (z. B. `HTTP 404`) unter der Zeile.
- Markenblock: Produktbeschreibung („Was ist das Produkt?“) und Auswahl der Nizza-Klassen; Klassenvorschlag, DPMA-Suchstring und Checkliste passen sich sofort im Browser an, die Eingaben werden nicht gesendet und nicht gespeichert; „Vorschlag wiederherstellen“ führt zum Vorschlag zurück.
- App Store in weiteren Ländern: Auf Wunsch (`appstore_at`, `appstore_ch`, `appstore_us`) durchsucht Markenfrei auch den App Store für Österreich, die Schweiz und die USA. Die Standardauswahl bleibt der deutsche Store; alle vier teilen sich das Abfragelimit von Apple.
- `docs/trademark-registers.md`: Abschnitt „Registerabfrage: Stand der Recherche (10. November 2026)“ mit der EUIPO-API (Zugang, Limits, Bedingungen), dem Befund zu TMview, DPMAconnectPlus, USPTO und WIPO, dem Umriss einer optionalen Quelle und einer Empfehlung. Gebaut ist dazu nichts.
- Neue Gestaltung der ganzen Seite („Registerpapier und Signalanlage“): Displayschrift Fraunces für Überschriften, wärmere Papierfarben mit Korn und Punktraster, Karten statt Linienlisten, Urteile als Stempel, Lampen statt Punkten. Farbe steht weiter nur für den Status und nie allein; alle Textkontraste bleiben über 4.5:1 (Werte in `globals.css`), heller und dunkler Modus weiter über `prefers-color-scheme`, Druckansicht unverändert schwarz auf weiß. Das Vorschaubild für geteilte Links (`opengraph-image.png`, `twitter-image.png`) folgt der neuen Gestaltung.
- Startseite: Karte „Umfang“ mit den Zahlen aus der Quellenliste, darunter die Abschnitte „Was ein Durchgang abfragt“ (je Namensraum die Standardquellen), Ampel, Anleitungen sowie MCP und API. Alle Namen und Zahlen stammen aus dem Code.
- Eingabe-Vorschau im Prüfer: Die erkannten Namen erscheinen als Plättchen mit dem Namen, wie er geprüft wird („Wach Werk“ → `wachwerk`), ungültige Eingaben mit Grund, Doppelte markiert; jedes Plättchen lässt sich entfernen. Zähler „3 / 10“. Die Taste `/` setzt den Cursor ins Namensfeld.
- Eingaben, die denselben Namen ergeben, werden nur noch einmal abgefragt (weniger Abfragen bei den Zieldiensten).
- Laufanzeige mit Fortschritt und „Abbrechen“: bricht offene Anfragen und das automatische Nachprüfen ab; abgebrochene Namen lassen sich einzeln erneut prüfen.
- Filter „Nur Auffälliges“: blendet in den Berichten die Quellen mit „nicht gefunden“ aus und nennt, wie viele ausgeblendet sind.
- Lichterkette in der Kopfzeile jeder Berichtskarte (je Quelle ein Segment in der Farbe ihres Status, gruppiert nach Namensraum) und Zählung der Namen je Ampel über einer Shortlist. Der Signalgeber im Seitenkopf läuft während der Prüfung und zeigt danach die schlechteste Ampel; beides ist Zierde, die Aussage steht als Text.
- Mitlaufendes Inhaltsverzeichnis auf `/quellen`, `/api-docs` und `/mcp` (ab großen Schirmen), aktuelle Seite in der Hauptnavigation markiert, Link „API“ im Seitenkopf, Fußzeile mit den Anleitungen.
- Darstellung im Seitenkopf wählbar (System, Hell, Dunkel). Ohne Wahl folgt die Seite weiter dem System und speichert nichts; erst „Hell“ oder „Dunkel“ legt den Eintrag `markenfrei:theme` im Browser an, „System“ löscht ihn wieder.
- Verlauf „Zuletzt geprüft“: nur auf diesem Gerät und nur, wenn man ihn einschaltet (Eintrag `markenfrei:history`, die letzten 12 Prüfungen mit Namen, Auswahl und Zeitpunkt). Ein Klick prüft erneut, „Verlauf löschen und ausschalten“ entfernt ihn. Nichts davon erreicht den Server.
- Ergebnisseite grafisch aufbereitet: großes Urteilsfeld oben in jeder Berichtskarte (Ampelfarbe, Symbol und Text, ein Satz aus den vorhandenen Texten, Zählung der Quellen) mit einem gegliederten Balken nach Anzahl der Quellen (unbekannt und nicht zulässig schraffiert, jedes Segment mit Text im Label). Keine Prozente, kein Punktwert.
- Ähnliche Marken als Zeilen: neues optionales, additives Feld `SourceResult.matches` (`{ label, kind, id? }`, bis zu 5, `kind` = gleich, klanggleich, schreibaehnlich, enthalten) in `wikidata_brands` und `known_brands`; `schemaVersion` bleibt 2, `note` und `evidence` unverändert. Die Oberfläche zeigt je Treffer Art-Chip (Symbol und Wort) und die übereinstimmenden Buchstaben hervorgehoben (`src/lib/match-highlight.ts`), mit dem Hinweis, dass Ähnlichkeit kein Rechtsbefund und kein Treffer keine Freigabe ist.

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
- Abfragebudgets für die Wortfeld-Suche („Keine Idee?“, `markenfrei_suggest_names`): OpenThesaurus höchstens 50 Anfragen pro Minute, Datamuse 60 pro Minute (eigene Grenze); bei erschöpftem Budget gibt es weniger Vorschläge statt eines Fehlers.
- Die Live-Probe prüft jetzt alle Quellen außer den beiden netzlosen (`known_brands`, `wikidata_brands`) sowie die Domain-Registries für .de, .com und .io, und bricht ab, wenn eine Quelle weder Kanariennamen noch begründete Ausnahme hat (`src/lib/probe-canaries.ts`, offline getestet).

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
- Exporte (JSON, CSV, Markdown, Erinnerung als .ics) stehen gesammelt im Menü „Exportieren“; „Link kopieren“ und „Drucken“ bleiben direkt sichtbar.
- Die Datenschutzerklärung nennt die beiden optionalen Einträge im Browser-Speicher (`markenfrei:theme`, `markenfrei:history`) und ihre Grundlage (§ 25 Abs. 2 Nr. 2 TDDDG); die frühere Aussage „kein Browser-Speicher“ gilt nur noch, solange man nichts einschaltet.
- Favicon, Apple-Touch-Icon und die Icons im Manifest (192 und 512 Pixel) zeigen den Signalgeber mit drei Lampen statt des Buchstabens „M“.
- MCP: Unerwartete Fehler melden einen festen Text („Interner Fehler. Bitte später erneut versuchen.“) statt der Meldung der Ausnahme.
- Die Seite „App-Namen prüfen“ erklärt, dass eine volle Trefferseite im App Store ohne exakten Titel als „ähnlich“ gilt statt als „nicht gefunden“.
- Ist das Abfragelimit eines Dienstes für längere Zeit erreicht (nächster freier Platz mehr als 60 Sekunden entfernt, z. B. GitHub ohne Token, ecosyste.ms, AUR), bleibt die Quelle „unbekannt“ mit eigenem Hinweis (Beleg `budget_long`) und ist nicht mehr `retryable`; Weboberfläche und MCP wiederholen dann nicht mehr automatisch.
- `probe-status.json` enthält jetzt auch die Einträge `rdap:de`, `rdap:com` und `rdap:io` und nicht mehr `known_brands`.

### Behoben

- Eine fehlgeschlagene Wiederholung ersetzt keinen fertigen Bericht mehr.
- Kontaktversand läuft wieder auf Node 20 (`Promise.withResolvers` ersetzt).
- Die Live-Probe schlägt bei Fehlern fehl (pipefail); der NuGet-Kanarienname ist jetzt `serilog` (`newtonsoft-json` gibt es dort nicht, die ID lautet `Newtonsoft.Json`).
- Dokumentation: Ampel-Regel an `verdict.ts` angeglichen, falsche Zusage „Link zu jeder Quelle“ entfernt, `llms.txt` ohne falsche Zusagen.
- Rate-Limit: An der Obergrenze der gemerkten Clients verliert ein Client nicht mehr sein laufendes Fenster; verdrängt werden zuerst abgelaufene, dann die ältesten Fenster anderer Clients.
- Rate-Limit: Adressen mit Port in `x-forwarded-for` (`1.2.3.4:5678`, `[2001:db8::1]:443`) zählen auf denselben Zähler wie die Adresse ohne Port.
- MCP: Die Kosten eines Prüfaufrufs mit `social` ohne `sources` berücksichtigen die ergänzten Quellen Bluesky und Mastodon.
- `next build` und `next start` warnen nicht mehr vor einer fremden `package-lock.json` in einem Elternverzeichnis: Tracing-Root und Turbopack-Root sind auf das Projektverzeichnis festgelegt.
- E2E: Die Prüfungen „Grün“ und „Rot“ lesen jetzt das Urteilsfeld der Berichtskarte (vorher passten Überschrift und Legende immer); der Fall „zu viele Namen“ ist abgedeckt.
- App Store, Firefox Add-ons, F-Droid und Show HN melden „nicht gefunden“ nur noch, wenn alle Treffer geprüft wurden; bei voller Trefferseite oder mehr Treffern als geliefert lautet das Ergebnis „ähnlich“ mit Hinweis (vorher konnte das fälschlich Grün ergeben).
- Die Quelle „Marken (Wikidata-Stand)“ prüft den Schnappschuss und baut den Vergleichsindex nur noch einmal statt bei jeder Abfrage.
- Hängt sich eine Prüfung an eine laufende gleiche Anfrage einer anderen Prüfung an, übernimmt sie deren Zeitüberschreitung nicht mehr, sondern fragt selbst.
- Interne Fehlermeldungen erscheinen nicht mehr im Beleg (`evidence`) von `/api/check` und MCP, nur noch der Fehlertyp.
- Eine Zeitüberschreitung beim Lesen der Antwort wird als Zeitüberschreitung gemeldet statt als Netzwerkfehler.
- Dokumentation: `src/lib/README.md` (alle Module), `src/app/api/README.md` (sieben Routen, tatsächliche Limits), GitHub-Budget (50 statt 60 neue Namen pro Stunde), `docs/design.md` (13 Zieldienste mit Budget) und der Hinweis zum Browser-Speicher stimmen wieder mit dem Code überein.

## [2.0.0]

Erste Fassung von v2: 30 Quellen, Ampel ohne Punktwert, API und MCP-Server.
