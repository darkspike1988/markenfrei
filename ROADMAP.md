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
| Domains | ✅ RDAP für 19 Endungen (IANA-Bootstrap, feste Einträge für `.de`, `.io`, `.ch`, `.li`), `.at` und `.eu` nur über DNS. DNS über HTTPS bestätigt nur „vergeben“. |
| Pakete | ✅ Standard: npm, PyPI, GitHub, crates.io, Homebrew. Auf Wunsch: NuGet, RubyGems, Maven Central, Packagist, pub.dev, JSR, Hex.pm, CRAN, Open VSX. |
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
| 🟡 | Veröffentlichung des MCP-Pakets | `markenfrei-mcp` ist gebaut und getestet, aber nicht auf npm. Der Registry-Name `app.markenfrei/mcp` setzt eine Domain-Verifizierung für markenfrei.app voraus. Vorher die Versionen nach dem Schema unten angleichen. |
| 🟡 | Öffentliches Repository | `github.com/darkspike1988/markenfrei` ist öffentlich nicht erreichbar. Anleitung (`git clone`), CI-Badge und die Links in `mcp/package.json` und `server.json` führen erst nach der Freigabe zum Ziel. Vor der Veröffentlichung des Pakets das Repository öffentlich machen. |
| 🟡 | Docker und Umgebungsvariablen | Der Container übernimmt keine `.env.local`, `docker-compose.yml` reicht noch keine `MARKENFREI_*`- oder `GITHUB_TOKEN`-Variable durch, und ohne `.dockerignore` landen `node_modules`, `.next` und eine lokale `.env.local` per `COPY . .` in der Build-Stufe. Geplant: `.dockerignore` (`node_modules`, `.next`, `.env*`, `mcp/dist`) und `env_file: .env.local` in der Compose-Datei. |
| 🟡 | Name und Anspruch | „Markenfrei“ verspricht mehr als die Vorprüfung leistet. Soll der Name bleiben? |
| 🟡 | Echte Registerabfrage | EUIPO (Registrierung, Sandbox) und USPTO (API-Schlüssel) wären die einzigen Wege. Möglich als optionale Quelle mit eigenem Schlüssel des Betreibers, nach Prüfung der Nutzungsbedingungen. |
| 🟡 | GitHub-Token | Ein Token beim Betreiber hebt das Limit von 60 auf 5.000 Anfragen pro Stunde, ist aber ein Geheimnis in der Server-Umgebung. |
| 🟡 | Origin-Prüfung für `/api/mcp` | Der Abgleich mit dem eigenen Host schützt nicht vor DNS-Rebinding. Für eine strengere Prüfung `MARKENFREI_ALLOWED_ORIGINS` setzen und den Host-Abgleich entfernen. |

### Versionsschema

Maßgeblich ist die **Produktversion**, derzeit 2.0.0. Die Hauptversion folgt der
Spezifikation (v2) und dem Berichtsschema (`schemaVersion: 2`). Sie steht an diesen Stellen
und muss dort gleich sein:

| Stelle | Heute | Soll |
|---|---|---|
| `MCP_SERVER_VERSION` in `src/mcp/server.ts` | 2.0.0 | 2.0.0 |
| User-Agent in `src/lib/engine/http.ts` | `Markenfrei/2.0` | `Markenfrei/<Haupt>.<Neben>` |
| `mcp/package.json` und `mcp/server.json` | 0.2.0 | 2.0.0 |
| `package.json` (Wurzel, `private: true`, wird nicht veröffentlicht) | 0.1.0 | 2.0.0 |

Regeln: Eine neue Hauptversion nur bei einer Änderung am Berichtsschema oder an den
Tool-Eingaben, die alte Clients bricht. Neue Quellen oder Endungen erhöhen die Nebenversion,
Fehlerbehebungen die dritte Stelle. MCP-Paket und Server erscheinen immer mit derselben
Version.

---

## Später

| Status | Idee | Voraussetzung |
|---|---|---|
| ⬜ | Weitere Endungen | Eintrag im IANA-Bootstrap oder fester RDAP-Server und ein Test mit bekanntem und freiem Namen |
| ⬜ | Rate-Limit über mehrere Instanzen (gemeinsamer Speicher) | Betrieb mit mehr als einer Instanz |
| ⬜ | Einbettbare Ampel für eigene Seiten | stabiles Schema (`NameReport`, `schemaVersion: 2`) ✅ |

---

## Nicht geplant

- **Kein LLM im Produkt.** Urteil und Vorschläge entstehen aus festen Regeln und offenen
  Daten. LLMs nutzen Markenfrei von außen über MCP.
- **Keine Konten, kein Tracking, keine Speicherung von Suchanfragen.**
- **Keine Umgehung von Bot-Abwehr** und keine automatisierten Abfragen bei Diensten, die das
  nicht anbieten (zum Beispiel TMDB, Instagram, TikTok).
- **Keine Rechtsberatung.**

---

## Mitmachen

Fehlerberichte und Ideen gern als Issue. Wie man lokal startet und beiträgt, steht in
[CONTRIBUTING.md](CONTRIBUTING.md).
