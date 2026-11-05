# Roadmap

Stand: 4. November 2026, Version 2. Grundlage ist [docs/v2-spec.md](docs/v2-spec.md), die aus
dem [Review und der Konkurrenzanalyse](docs/review-and-competition-2026-11.md) entstanden ist.

Markenfrei beantwortet eine Frage: „Kann ich diesen Namen in den gängigen Namensräumen nutzen,
und wo muss ich für Marken selbst nachsehen?“ Ohne LLM, ohne Konto, ohne Tracking. Agenten nutzen Markenfrei
über den [MCP-Server](README.md#mcp-server-für-agenten).

**Legende:** ✅ gebaut und mit Tests abgedeckt · 🔗 nur Link, keine Abfrage ·
🟡 Entscheidung offen · ⬜ geplant

---

## Stand v2

| Bereich | Ergebnis |
|---|---|
| Engine | ✅ Eine Engine in `src/lib/engine/` für Oberfläche, `/api/check` und MCP. Fünf Status (`taken`, `not_found`, `similar`, `invalid`, `unknown`), Ampel ohne Score aus einer einzigen Funktion. |
| Domains | ✅ RDAP für 31 Endungen (IANA-Bootstrap, feste Einträge für `.de`, `.io`, `.ch`, `.li`), `.at` und `.eu` nur über DNS. DNS über HTTPS bestätigt nur „vergeben“. |
| Pakete | ✅ Standard: npm, PyPI, GitHub, crates.io, Homebrew. Auf Wunsch: NuGet, RubyGems, Maven Central, Packagist, pub.dev, JSR, Hex.pm, CRAN, Open VSX, Hugging Face, Hackage, Terraform Registry, DEV (dev.to). |
| App Stores | ✅ Apple App Store, Google Play; auf Wunsch F-Droid und Firefox Add-ons. |
| Bekannte Namen | ✅ Marken-Heuristik als Quelle `known_brands`, Wikidata, GLEIF; Wikipedia und Show HN als schwache Signale auf Wunsch. |
| Social | ✅ Bluesky, Mastodon (mastodon.social), Hacker News auf Wunsch; Instagram, TikTok, X, YouTube und Chrome Web Store als Links zur Prüfung von Hand. |
| **Marke** | 🔗 immer „nicht geprüft“. Recherche-Vorbereitung mit Registerlinks (Prüfdatum 4. November 2026), DPMA-Expertensuchstring, Varianten, Klassenvorschlag, Checkliste. |
| Last | ✅ Semaphor pro Host, Bündelung gleicher Anfragen, 5 s pro Anfrage, 8 s pro Prüfung, begrenzte Antwortgrößen, Cache für eindeutige Ergebnisse (10 Minuten, nur im Arbeitsspeicher), GitHub-Sperre nach Rate-Limit. |
| Oberfläche | ✅ Ein Feld für einen Namen oder bis zu 10, Chips für Namensräume und Endungen, Zustand im Link, Rangliste für Shortlists, JSON-Export, „Keine Idee?“ mit regelbasierten Vorschlägen. Seiten `/quellen` und `/mcp`. Dark Mode über `prefers-color-scheme`. |
| HTTP | ✅ `POST /api/check` (zod-Prüfung, 16 KB, Rate-Limit je Name), `POST /api/mcp` (Origin-Prüfung, 64 KB, keine Batches, Rate-Limit je Name). |
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
| 🟡 | Öffentliches Repository | `github.com/darkspike1988/markenfrei` ist öffentlich nicht erreichbar. Anleitung (`git clone`), CI-Badge und die Links in `mcp/package.json` und `server.json` führen erst nach der Freigabe zum Ziel. Vor der Veröffentlichung des Pakets das Repository öffentlich machen. |
| 🟡 | Name und Anspruch | „Markenfrei“ verspricht mehr als die Vorprüfung leistet. Soll der Name bleiben? |
| 🟡 | Echte Registerabfrage | EUIPO (Registrierung, Sandbox) und USPTO (API-Schlüssel) wären die einzigen Wege. Möglich als optionale Quelle mit eigenem Schlüssel des Betreibers, nach Prüfung der Nutzungsbedingungen. |
| 🟡 | GitHub-Token | Ein Token beim Betreiber hebt das Limit von 60 auf 5.000 Anfragen pro Stunde, ist aber ein Geheimnis in der Server-Umgebung. |
| 🟡 | Origin-Prüfung für `/api/mcp` | Der Abgleich mit dem eigenen Host schützt nicht vor DNS-Rebinding. Für eine strengere Prüfung `MARKENFREI_ALLOWED_ORIGINS` setzen und den Host-Abgleich entfernen. |

### Vor dem Livegang (Stand 5. November 2026)

Code, Tests, Sicherheits- und Code-Review sind abgeschlossen; offen ist nur der Betrieb:

| Status | Schritt | Detail |
|---|---|---|
| ⬜ | Betreiberangaben setzen | `MARKENFREI_OPERATOR_NAME`, `_ADDRESS`, `_EMAIL`, `MARKENFREI_HOSTING_PROVIDER` in `.env` neben `docker-compose.yml`. Ohne sie zeigen `/impressum` und `/datenschutz` den Hinweis „darf so nicht öffentlich laufen“. |
| ⬜ | Deployment und TLS | `docker compose up -d --build` auf dem Server, Reverse-Proxy mit Host `markenfrei.app` auf `127.0.0.1:3000`, der `x-forwarded-for` setzt (Beispiel: README). Bei zwei Proxys davor `MARKENFREI_TRUSTED_PROXIES=2`. |
| ⬜ | `GITHUB_TOKEN` und `MARKENFREI_CONTACT` | Token ohne Berechtigungen in `.env`; sonst gilt für GitHub 60 Anfragen pro Stunde für alle Nutzer zusammen. |
| ⬜ | Proxy-Limits | Je-IP-Limit, Body-Größe und Timeouts zusätzlich am Reverse-Proxy. |
| 🟡 | Name „Markenfrei“ | Eigene Markenrecherche (DPMA, EUIPO) vor öffentlichem Start; `markenfrei.com` und `markenfrei.de` sind registriert (Inhaber nicht geprüft). |

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
| ⬜ | Rate-Limit über mehrere Instanzen (gemeinsamer Speicher) | Betrieb mit mehr als einer Instanz; Optionen und Entscheidung: [docs/design.md](docs/design.md) |

---

## Nicht geplant

- **Kein LLM im Produkt.** Urteil und Vorschläge entstehen aus festen Regeln und offenen
  Daten. LLMs nutzen Markenfrei von außen über MCP.
- **Keine Konten, kein Tracking, keine Speicherung von Suchanfragen.**
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
