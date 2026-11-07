# Roadmap

Stand: 4. November 2026, Version 2. Grundlage ist [docs/v2-spec.md](docs/v2-spec.md), die aus
dem [Review und der Konkurrenzanalyse](docs/review-and-competition-2026-11.md) entstanden ist.

Markenfrei beantwortet eine Frage: „Kann ich diesen Namen in den gängigen Namensräumen nutzen,
und wo muss ich für Marken selbst nachsehen?“ Ohne LLM, ohne Konto, ohne Personen-Tracking. Agenten nutzen Markenfrei
über den [MCP-Server](README.md#mcp-server-für-agenten).

**Legende:** ✅ gebaut und mit Tests abgedeckt · 🔗 nur Link, keine Abfrage ·
🟡 Entscheidung offen · ⬜ geplant

---

## Stand v2

| Bereich | Ergebnis |
|---|---|
| Engine | ✅ Eine Engine in `src/lib/engine/` für Oberfläche, `/api/check` und MCP. Fünf Status (`taken`, `not_found`, `similar`, `invalid`, `unknown`), Ampel ohne Score aus einer einzigen Funktion. |
| Domains | ✅ RDAP für 31 Endungen (IANA-Bootstrap, feste Einträge für `.de`, `.io`, `.ch`, `.li`), `.at` und `.eu` nur über DNS. DNS über HTTPS bestätigt nur „vergeben“. |
| Pakete | ✅ Standard: npm, PyPI, GitHub, crates.io, Homebrew. Auf Wunsch: NuGet, RubyGems, Maven Central, Packagist, pub.dev, JSR, Hex.pm, CRAN, Open VSX, Hugging Face, Hackage, Terraform Registry, DEV (dev.to), AUR, Repology (Projektname in rund 300 Paketquellen), Docker Hub (offizielle Images), conda-forge, Clojars (die letzten drei über den Index von ecosyste.ms). |
| App Stores | ✅ Apple App Store, Google Play; auf Wunsch F-Droid und Firefox Add-ons. |
| Bekannte Namen | ✅ Marken-Heuristik als Quelle `known_brands`, Wikidata, GLEIF; Wikipedia und Show HN als schwache Signale auf Wunsch. |
| Social | ✅ Bluesky, Mastodon (mastodon.social), Hacker News auf Wunsch; Instagram, TikTok, X, YouTube und Chrome Web Store als Links zur Prüfung von Hand. |
| **Marke** | 🔗 immer „nicht geprüft“. Recherche-Vorbereitung mit Registerlinks (Prüfdatum 4. November 2026), DPMA-Expertensuchstring, Varianten, Klassenvorschlag, Checkliste. |
| Last | ✅ Semaphor pro Host, Bündelung gleicher Anfragen, 5 s pro Anfrage, 8 s pro Prüfung, begrenzte Antwortgrößen, Cache für eindeutige Ergebnisse (10 Minuten, nur im Arbeitsspeicher), GitHub-Sperre nach Rate-Limit. |
| Oberfläche | ✅ Ein Feld für einen Namen oder bis zu 10, Chips für Namensräume und Endungen, Zustand im Link, Rangliste für Shortlists, JSON-Export, „Keine Idee?“ mit regelbasierten Vorschlägen. Seiten `/quellen` und `/mcp`. Dark Mode über `prefers-color-scheme`. |
| Namensanalyse und Varianten | ✅ „Name im Detail“ in jedem Bericht (`src/lib/insights.ts`, ohne Netz, ohne Punktwert): Länge, geschätzte Silben, Ziffern, Bindestriche, Verwechslungspaare (l/I/1, o/0, rn/m, vv/w), Tippfehler-Varianten, Ähnlichkeit zu bekannten Marken; „Tippfehler-Varianten prüfen“ startet eine Shortlist. „Varianten“ unter „Keine Idee?“ erzeugt Kandidaten aus Präfixen, Suffixen, Bindestrich und Plural. |
| Ergebnisse weiterverwenden | ✅ Vergleichsmatrix für mehrere Namen (`src/components/matrix-view.tsx`, `src/lib/matrix.ts`), Export als CSV und Markdown neben JSON (`src/lib/export.ts`, RFC 4180, Formelschutz), Druckansicht (`@media print`, Berichtszeilen werden vor dem Druck aufgeklappt). |
| Anleitungen | ✅ Vier statische Seiten mit eingebettetem Prüfer und Grenzen-Abschnitt: `/domain-pruefen`, `/paketname-pruefen`, `/app-name-pruefen`, `/markenrecherche-vorbereiten`. Listen und Zahlen kommen aus dem Code, FAQ-JSON-LD nur mit sichtbaren Fragen. |
| Kontakt | ✅ Kontaktformular `/kontakt` und `POST /api/contact` (zod-Prüfung, 8 KB, Honigfalle, signierte Zeitmarke, 3 Nachrichten pro Stunde und IP, 30 pro Stunde und Prozess). Versand per SMTP über den Mailserver des Betreibers (`MARKENFREI_SMTP_URL`), ohne Speicherung und ohne Dienste Dritter. |
| HTTP | ✅ `POST /api/check` (zod-Prüfung, 16 KB, Rate-Limit je Name), `POST /api/mcp` (Origin-Prüfung, 64 KB, keine Batches, Rate-Limit je Name). |
| API-Dokumentation | ✅ Seite `/api-docs` (Beispiele in curl, JavaScript, Python; Antwortformat, Grenzen, Fehler), `GET /api/openapi.json` (OpenAPI 3.1, aus den Code-Konstanten und zod-Schemas erzeugt, Test gegen Drift), `GET /api/health` (Version, ohne Netz und Geheimnisse). |
| MCP | ✅ Vier Tools mit `outputSchema` und `annotations`, Server-`instructions`. Eigenes Paket `markenfrei-mcp` in `mcp/`, mit esbuild zu einer Datei gebündelt, `npm pack` und Start aus fremdem Verzeichnis in der CI getestet. |
| Entfernt | Score /100, Preisvergleich, Bundle-ID-Modus, REA-Route, Phonetik-Codes in der Oberfläche, Zufallsbeispiele, Go-Proxy, DuckDuckGo, alte MCP-Tools. |

**Wichtig:** Grün heißt „in den gewählten Quellen nichts gefunden“. Es heißt nicht „als Marke
frei“. Warum kein Register live abgefragt wird, steht in
[docs/trademark-registers.md](docs/trademark-registers.md). Das Tool ist eine Vorprüfung,
keine Rechtsberatung.

---

## Offen und braucht eine Entscheidung

| Status | Thema | Frage |
|---|---|---|
| 🟡 | Veröffentlichung des MCP-Pakets | `markenfrei-mcp` ist gebaut und getestet, aber nicht auf npm. Der Registry-Name `app.markenfrei/mcp` setzt eine Domain-Verifizierung für markenfrei.app voraus. Die Versionen sind nach dem Schema unten angeglichen. |
| 🟡 | Echte Registerabfrage | EUIPO (Registrierung, Sandbox) und USPTO (API-Schlüssel) wären die einzigen Wege. Möglich als optionale Quelle mit eigenem Schlüssel des Betreibers, nach Prüfung der Nutzungsbedingungen. |
| 🟡 | GitHub-Token | Ein Token beim Betreiber hebt das Limit von 60 auf 5.000 Anfragen pro Stunde, ist aber ein Geheimnis in der Server-Umgebung. |
| 🟡 | Origin-Prüfung für `/api/mcp` | Der Abgleich mit dem eigenen Host schützt nicht vor DNS-Rebinding. Für eine strengere Prüfung `MARKENFREI_ALLOWED_ORIGINS` setzen und den Host-Abgleich entfernen. |

### Livegang (Stand 5. November 2026)

Code, Tests, Sicherheits- und Code-Review sind abgeschlossen; offen ist nur der Betrieb:

| Status | Schritt | Detail |
|---|---|---|
| ✅ | Betreiberangaben | in `.env` auf dem Server gesetzt; `/impressum` und `/datenschutz` zeigen sie. |
| ✅ | Deployment und TLS | Container hinter Caddy auf `markenfrei.app`, Zertifikat von Let's Encrypt. Auf dem Server hat Docker keinen freien Adressbereich mehr für neue Netzwerke; dort steuert eine lokale `docker-compose.override.yml` (`network_mode: bridge`), der Host-Port kommt aus `MARKENFREI_HOST_PORT`. |
| ✅ | `MARKENFREI_CONTACT` | gesetzt. |
| ✅ | `www.markenfrei.app` | DNS zeigt auf den Server, Caddy leitet per 301 auf `markenfrei.app` weiter (Zertifikat von Let's Encrypt). |
| ⬜ | `GITHUB_TOKEN` | Token ohne Berechtigungen in `.env`; sonst gilt für GitHub 60 Anfragen pro Stunde für alle Nutzer zusammen. |
| ⬜ | Proxy-Limits | Je-IP-Limit, Body-Größe und Timeouts zusätzlich am Reverse-Proxy. |
| ✅ | Name „Markenfrei“ | Entschieden: Der Name ist ein beschreibender Begriff (Gattungsbegriff) und als Marke nicht eintragungsfähig; eine Anmeldung ist nicht vorgesehen. Der Name bleibt als Arbeitsname, Kennzeichen ist die Domain `markenfrei.app` (`markenfrei.com` und `markenfrei.de` sind registriert, Inhaber nicht geprüft). Der Anspruch bleibt auf „Vorprüfung“ begrenzt: Grün heißt nur „nichts gefunden“. |

### Versionsschema

Maßgeblich ist die **Produktversion**, derzeit 2.0.0. Die Hauptversion folgt der
Spezifikation (v2) und dem Berichtsschema (`schemaVersion: 2`). Sie steht an diesen Stellen
und muss dort gleich sein:

| Stelle | Stand |
|---|---|
| `MCP_SERVER_VERSION` in `src/mcp/server.ts` | 2.0.0 |
| User-Agent in `src/lib/engine/http.ts` | `Markenfrei/2.0` (`<Haupt>.<Neben>`) |
| `mcp/package.json` und `mcp/server.json` | 2.0.0 |
| `package.json` (Wurzel, `private: true`, wird nicht veröffentlicht) | 2.0.0 |

Regeln: Eine neue Hauptversion nur bei einer Änderung am Berichtsschema oder an den
Tool-Eingaben, die alte Clients bricht. Neue Quellen oder Endungen erhöhen die Nebenversion,
Fehlerbehebungen die dritte Stelle. MCP-Paket und Server erscheinen immer mit derselben
Version.

---

## Später

| Status | Idee | Voraussetzung |
|---|---|---|
| ⬜ | Rate-Limit und Budgets über mehrere Prozesse (gemeinsamer Speicher) | Heute nicht unterstützt (Betriebsgrenze, ein Prozess); nur falls ein Bedarf für mehr als einen Prozess entsteht, Optionen: [docs/design.md](docs/design.md) |

---

## Nicht geplant

- **Kein LLM im Produkt.** Urteil und Vorschläge entstehen aus festen Regeln und offenen
  Daten. LLMs nutzen Markenfrei von außen über MCP.
- **Keine Konten, kein Personen-Tracking, keine Speicherung von Suchanfragen.** Gezählt werden nur anonyme Seitenaufrufe und feste Aktionen auf dem eigenen Server (GoatCounter, ohne Cookies, ohne Namen, 12 Monate).
- **Keine Umgehung von Bot-Abwehr** und keine automatisierten Abfragen bei Diensten, die das
  nicht anbieten (zum Beispiel TMDB, Instagram, TikTok).
- **Keine einbettbare Ampel (Badge, iframe, Widget) für fremde Seiten.** Jeder Seitenaufruf
  auf der fremden Seite würde eine Prüfung bei den Zieldiensten auslösen, die kein Nutzer
  von Markenfrei angestoßen hat. Das widerspricht dem Grundsatz „nur Einzelabfragen, die ein
  Nutzer auslöst“, treibt die Last gegen die Budgets der Zieldienste und verlangt
  zwangsläufig Zwischenspeicherung je Name. Wer das Ergebnis einbetten will, ruft die API
  selbst auf und zeigt das Berichtsschema an.
- **Keine Rechtsberatung.**

---

## Mitmachen

Fehlerberichte und Ideen gern als Issue. Wie man lokal startet und beiträgt, steht in
[CONTRIBUTING.md](CONTRIBUTING.md).
