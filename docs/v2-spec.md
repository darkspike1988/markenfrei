# Markenfrei v2: Spezifikation

Grundlage: [review-and-competition-2026-11.md](review-and-competition-2026-11.md) (Review,
Konkurrenzanalyse, 21 live gegengeprüfte Quellen). Stand 4. November 2026.

## Use Case

**Menschen:** Entwickler, Indie-Gründer und kleine Teams im DACH-Raum, kurz bevor sie sich
auf einen Namen festlegen (vor `npm init`, App-Store-Eintrag, Domain-Kauf, Repo). Frage:
„Kann ich diesen Namen in den gängigen Namensräumen nutzen, und wo muss ich für Marken selbst
nachsehen?“
Antwort in wenigen Sekunden: eine Zeile pro Namensraum mit Quelle und Link zum
Nachprüfen (wo die Quelle einen liefert), eine ehrliche Ampel, und eine fertige Vorbereitung für die Markenrecherche.

**Agenten (MCP):** Ein Coding-Agent prüft vor dem Anlegen eines Projekts oder Pakets, ob
der Name in den benötigten Namensräumen frei ist. Beim Benennen erzeugt das LLM des Clients
die Kandidaten, Markenfrei prüft sie deterministisch (`check_names`).

## Grundsätze (unverändert)

Kein LLM im Produkt, keine Konten, kein Personen-Tracking (nur anonyme Seitenzählung ohne Cookies, ohne Namen), keine Speicherung von Suchanfragen, nur
offene Quellen ohne Schlüssel, keine Umgehung von Bot-Abwehr, robots.txt und
Nutzungsbedingungen respektieren, nur Einzelabfragen, die ein Nutzer auslöst.

## Ergebnismodell

- Jede Quelle liefert genau ein `SourceResult` mit `status`:
  - `taken`: eindeutig vergeben bzw. vorhanden
  - `not_found`: die Quelle kennt den Namen nicht. Das heißt **nicht** „registrierbar“
  - `similar`: kein exakter Treffer, aber ein ähnlicher oder nicht eindeutiger
    (z. B. Maven artifactId, unscharfe Suchen)
  - `invalid`: Der Name ist in diesem Namensraum syntaktisch nicht zulässig
  - `unknown`: keine verwertbare Antwort (Timeout, 429, 5xx, unerwartetes Format,
    Quelle deaktiviert). **Nie** als frei werten
- Namensräume (`Namespace`): `domains`, `packages`, `stores`, `social`, `known_names`.
- **Marke** ist kein Namensraum mit Ampel. Sie ist immer „nicht geprüft“ und wird durch
  die Recherche-Vorbereitung ersetzt.
- **Ampel pro Name** (eine Quelle der Wahrheit, keine Geschmackskriterien, kein Score):
  - `red`, sobald eine geprüfte Quelle `taken` meldet, **außer** bei Quellen, die als
    schwaches Signal markiert sind (`weak: true`, z. B. Wikipedia, HN-Suche). Schwache
    Treffer ergeben höchstens `yellow`.
  - `green` nur, wenn alle angefragten Quellen `not_found` melden und keine `unknown`
    oder `similar` ist.
  - sonst `yellow`.
  - Labels: grün „Keine Treffer“, gelb „Treffer oder Lücken prüfen“, rot „Vergeben“.
- Die Marken-Heuristik (89 bekannte Marken, Phonetik) wird zur Quelle `known_brands` im
  Namensraum `known_names`. Identisch: `taken`. Klanggleich (Kölner Phonetik gleich UND
  Levenshtein ≤ 2 UND mindestens 4 Stellen): `similar`. „Enthalten“ nur ab 5 Zeichen an
  einer Wortgrenze: `similar`.

## Quellen

Standard aktiv (Web und MCP gleich):

| Namensraum | Quellen |
|---|---|
| domains | RDAP für gewählte Endungen (Standard `de`, `com`, `dev`, `app`, `io`), dynamisch aus dem IANA-Bootstrap plus feste Overrides für `de`, `io`, `ch`, `li` (Bootstrap fehlt dort); DoH nur als Bestätigung von „vergeben“ |
| packages | npm, PyPI, GitHub (Nutzer/Organisation), crates.io, Homebrew (Formula UND Cask) |
| stores | Apple App Store (Suche, exakter Titel), Google Play (Bundle-IDs `com.{name}.app`, `de.{name}.app` per HEAD) |
| known_names | bekannte Marken (Heuristik), Wikidata (SPARQL, exaktes Label mit Typ Unternehmen/Marke/Software), GLEIF (aktive Rechtsträger, exakter Name) |

Optional (auf Auswahl): NuGet, RubyGems, Maven Central (`similar` statt `taken`),
Packagist (nur mit Kontakt im User-Agent), pub.dev, JSR, Hex.pm, CRAN (crandb), Open VSX,
Hugging Face (Organisation und Nutzer), Hackage (Suche für andere Schreibweisen), Terraform
Registry (Modul- und Provider-Namespaces), DEV (Nutzer und Organisation)
(Namespace), Firefox Add-ons (exakter Name), F-Droid (exakter Name), Bluesky,
Mastodon (mastodon.social WebFinger), Hacker News (Nutzer, Show-HN-Suche als schwaches
Signal), Wikipedia (schwaches Signal). Seit 5. November 2026 außerdem AUR (aurweb-RPC),
Repology (Projektname in rund 300 Paketquellen, eigener User-Agent mit Quellcode-Link) und
über den Index von ecosyste.ms (`packages.ecosyste.ms`, nicht live aus dem Register): Docker
Hub (offizielle Images), conda-forge, Clojars; alle mit
`defaultEnabled: false` im Namensraum `packages`.

Entfernt: Go-Proxy (liefert für bloße Namen immer 404), DuckDuckGo (keine Unterscheidung
zwischen „nichts gefunden“ und Fehler), PyPI bleibt. Nicht aufgenommen (Gründe im Review):
Docker Hub, conda-forge direkt (nur indirekt über ecosyste.ms), CocoaPods, CPAN, Julia (Namen
brauchen die Schreibweise, ein falsches „nicht gefunden“ droht), Snapcraft,
Codeberg, GitLab, SourceHut, Debian-Quellen, Arch-Paketsuche, WordPress.org, SEC EDGAR, .co-RDAP, Steam,
Microsoft Store, Chrome Web Store, Reddit, Instagram, TikTok, X, YouTube. Für Instagram,
TikTok, X, YouTube und Chrome Web Store gibt es nur Deep-Links zur manuellen Prüfung.

**User-Agent:** `Markenfrei/2.0 (+https://markenfrei.app; <Kontakt>)`. Kontakt kommt aus
`MARKENFREI_CONTACT` (z. B. `mailto:ops@example.org`). Quellen, die einen Kontakt verlangen
(Packagist), liefern ohne ihn `unknown` mit Hinweis.

## Last und Robustheit

- HTTP-Client mit Semaphor pro Host (4 gleichzeitig), Bündelung gleicher gleichzeitiger
  Anfragen, Timeout pro Anfrage (5 s) und Gesamt-Deadline pro Prüfung (8 s).
- Antwortkörper begrenzt lesen (`maxBytes`), sonst abbrechen. HEAD, wo der Status reicht.
  npm mit `Accept: application/vnd.npm.install-v1+json`.
- Cache pro Quelle und Ziel für eindeutige Ergebnisse (`taken`, `not_found`, `invalid`,
  `similar`), 10 Minuten. `unknown` nie.
- GitHub: nach 403/429 mit `x-ratelimit-remaining: 0` bis `x-ratelimit-reset` keine
  Anfrage mehr, solange `unknown` mit Hinweis.

## Oberfläche (minimalistisch)

- Ein Feld: ein Name oder eine Shortlist (bis 10, getrennt durch Komma oder Zeilenumbruch).
- Darunter Chips für Namensräume und Endungen, Zustand im Link (`?q=a,b&tld=de,com&ns=...`).
- Ergebnis je Name: Ampel mit Label, Zeilen pro Quelle (Name, Status als Text und Farbe,
  Link zum Nachprüfen), „Geprüft am …“. Bei Shortlist: Rangliste „frei in allen gewählten“.
- Block „Marke: nicht geprüft“ mit Recherche-Vorbereitung: getestete Links (DPMA, TMview,
  EUIPO, WIPO, TMDB), gültiger DPMA-Expertensuchstring mit Kopier-Knopf, Schreibvarianten,
  Klassenvorschlag, Checkliste.
- Sekundär „Keine Idee?“: deterministische Vorschläge aus dem Wortfeld, die direkt geprüft
  werden.
- Weg: Bundle-ID-Modus, Score /100, Preisvergleich, Phonetik-Codes, API-Inventar im
  Dialog, Zufallsbeispiele, „Nur freie .de“.
- Barrierefreiheit: Label am Feld, `form`, Fokusführung, Status als Text, Kontrast AA,
  Tippziele ≥ 24 px. Dark Mode über `prefers-color-scheme`.
- Seite `/quellen`: alle Quellen mit Endpunkt, Signal, Grenzen.
- Seite `/mcp`: Einrichtung für Claude Code, Claude Desktop, Cursor.

## MCP

Tools (alle mit `registerTool`, `title`, `outputSchema`, `annotations`):

| Tool | Eingabe | Ausgabe |
|---|---|---|
| `markenfrei_check_name` | `name`, `namespaces?`, `tlds?`, `sources?` | `NameReport` (kompakter Text + `structuredContent`) |
| `markenfrei_check_names` | `names` (1–10), sonst wie oben | Rangliste mit Bericht je Name |
| `markenfrei_trademark_prep` | `name`, `classes?` | Links, DPMA-Expertenstring, Varianten, Klassen, Checkliste (ohne Netz) |
| `markenfrei_suggest_names` | `keywords` | deterministische Kandidaten aus dem Wortfeld (ungeprüft, zum Weiterreichen an `check_names`) |

Server-`instructions`: grün heißt nicht markenrechtlich frei, `unknown` nie als frei
werten, Marke mit `trademark_prep` vorbereiten.

HTTP: Batch-Anfragen mit mehr als einem Element ablehnen, Origin prüfen (fehlend erlaubt,
sonst nur eigene Domain und localhost), Body höchstens 64 KB, Rate-Limit.

Verteilung: eigenes Paket `markenfrei-mcp` (Ordner `mcp/`), gebündelt mit esbuild zu einer
Datei mit Shebang, ohne tsx zur Laufzeit. `npm pack` und Start aus einem fremden
Verzeichnis werden getestet. Veröffentlichen macht der Betreiber.
