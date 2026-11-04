# Markenfrei

[![CI](https://github.com/darkspike1988/markenfrei/actions/workflows/ci.yml/badge.svg)](https://github.com/darkspike1988/markenfrei/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Kann ich diesen Namen in den gängigen Namensräumen nutzen, und wo muss ich für Marken selbst
nachsehen?**

Markenfrei ([markenfrei.app](https://markenfrei.app)) prüft einen Namen oder eine Shortlist,
kurz bevor du dich festlegst: vor `npm init`, dem App-Store-Eintrag, dem Domain-Kauf oder dem
Repo. Gedacht für Entwickler, Indie-Gründer und kleine Teams im DACH-Raum.

Du bekommst je Name:

- eine Zeile pro Quelle mit Status als Text und Farbe und einem Link zum Nachprüfen, wo es
  einen gibt,
- eine Ampel, die nur aus diesen Status entsteht (kein Score, keine Geschmackskriterien),
- eine Vorbereitung für die Markenrecherche: Registerlinks, DPMA-Expertensuchstring,
  Schreibvarianten, Klassenvorschlag und Checkliste.

Coding-Agenten nutzen dieselbe Prüfung über den [MCP-Server](#mcp-server-für-agenten).

Grundsätze: kein LLM im Produkt, keine Konten, kein Tracking, keine Speicherung von
Suchanfragen, nur offene Quellen ohne Schlüssel, nur Einzelabfragen, die ein Nutzer auslöst.

## Was geprüft wird

Standardmäßig aktiv (Web und MCP gleich):

| Namensraum | Quellen |
|---|---|
| Domains | RDAP für die gewählten Endungen (Standard `.de`, `.com`, `.dev`, `.app`, `.io`, höchstens 8 je Prüfung). Der RDAP-Server kommt aus dem IANA-Bootstrap, für `.de`, `.io`, `.ch` und `.li` aus festen Einträgen. `.at` und `.eu` laufen nur über DNS und können deshalb nie „nicht gefunden“ ergeben. DNS über HTTPS bestätigt nur „vergeben“. |
| Pakete | npm, PyPI, GitHub (Nutzer oder Organisation), crates.io, Homebrew (Formula und Cask) |
| App Stores | Apple App Store Deutschland (Suche, vergeben nur bei exakt gleichem Haupttitel), Google Play (nur die Bundle-IDs `com.<name>.app` und `de.<name>.app`) |
| Bekannte Namen | Liste bekannter Tech-Marken (Heuristik ohne Netz: identisch, klanggleich nach Kölner Phonetik, enthalten), Wikidata (exaktes Label mit Typ Unternehmen, Marke, Software, Website, App oder Produkt), GLEIF (aktive Rechtsträger mit LEI, Namensstamm ohne Rechtsform) |

Auf Wunsch („Weitere Quellen“ in der Oberfläche, `sources` in API und MCP): NuGet,
RubyGems, Maven Central, Packagist, pub.dev, JSR, Hex.pm, CRAN, Open VSX, Hugging Face
(Organisationen und Nutzer), Hackage (auch bei anderer Schreibweise), Terraform Registry
(Namespaces), DEV (dev.to, Nutzer und Organisationen), F-Droid, Firefox Add-ons, Bluesky, Mastodon (mastodon.social), Hacker News sowie Wikipedia und
Show HN als schwache Signale. Für Instagram, TikTok, X, YouTube und den Chrome Web Store
gibt es nur Links zur Prüfung von Hand.

**Achtung bei `sources`:** Die Liste ersetzt die Standardquellen außerhalb von Domains, sie
ergänzt sie nicht. `sources: ["nuget"]` prüft nur noch die Domains und NuGet. Wer Quellen
hinzufügen will, schickt die Standardquellen-IDs mit: `npm`, `pypi`, `github`, `crates`,
`homebrew`, `appstore`, `googleplay`, `known_brands`, `wikidata`, `gleif`, dazu die
gewünschten Zusatzquellen. Alle IDs stehen auf der Seite `/quellen`.

Alle 21 Endungen und alle Quellen mit Endpunkt stehen auf der Seite `/quellen`.

### Status und Ampel

| Status | Bedeutung |
|---|---|
| `taken` | vergeben bzw. vorhanden |
| `not_found` | die Quelle kennt den Namen nicht; das heißt nicht „registrierbar“ |
| `similar` | kein exakter, aber ein ähnlicher oder nicht eindeutiger Treffer |
| `invalid` | der Name ist dort syntaktisch nicht zulässig |
| `unknown` | keine verwertbare Antwort (Timeout, Rate-Limit, Fehler); nie als frei gewertet |

- **Rot** („Vergeben“), sobald eine Quelle `taken` oder `invalid` meldet. Treffer bei
  schwachen Signalen ergeben höchstens Gelb.
- **Grün** („Keine Treffer“) nur, wenn alle angefragten Quellen `not_found` melden.
- **Gelb** („Treffer oder Lücken prüfen“) in allen anderen Fällen.

Bei einer Shortlist (bis 10 Namen) gibt es zusätzlich eine Rangliste: zuerst Grün, dann
Gelb, dann Rot, innerhalb davon nach Zahl der Treffer und dann der Lücken.

## Grenzen

- **Keine Markenprüfung.** Markenregister (DPMA, EUIPO, WIPO, USPTO) werden nicht abgefragt.
  Die Marke steht immer auf „nicht geprüft“; Markenfrei verlinkt die Register und bereitet
  die Suche vor. Warum keine Registerabfrage möglich ist, steht in
  [docs/trademark-registers.md](docs/trademark-registers.md).
- **Grün heißt nur „nichts gefunden“** in den gewählten Quellen, nicht „als Marke frei“ und
  nicht „registrierbar“.
- **Zeitgrenze.** Eine Prüfung dauert höchstens etwa 8 Sekunden (5 Sekunden je Anfrage).
  Langsame Quellen erscheinen als `unknown` unter „Ohne Antwort“.
- **Fremde Dienste sehen den Namen.** Die Anfragen gehen vom Server (oder bei stdio-MCP von
  deinem Rechner) direkt an die Quellen.
- **GitHub ohne Token** erlaubt 60 Anfragen pro Stunde und IP; danach meldet die Quelle
  `unknown`, bis das Limit zurückgesetzt ist.
- **„Keine Idee?“** erzeugt Vorschläge regelbasiert aus OpenThesaurus, Datamuse und festen
  Wortbausteinen. Die Vorschläge sind ungeprüft, bis du sie prüfst.
- **Keine Rechtsberatung.** Vor Anmeldung oder Nutzung eines Namens gehört eine fachkundige
  Markenrecherche dazu.

## Start

Voraussetzung: Node.js 20.9 oder neuer.

Hinweis: Solange das GitHub-Repository nicht öffentlich ist, funktionieren `git clone`, das
CI-Badge und die Repository-Links im npm-Paket nur mit Zugriff auf das Repository.

```bash
git clone https://github.com/darkspike1988/markenfrei.git
cd markenfrei
npm install
npm run dev
```

Danach `http://localhost:3000` öffnen. Für den Produktionsbetrieb:

```bash
npm run build
npm run start
```

Oder mit Docker:

```bash
docker compose up -d --build
```

Der Container liest keine `.env.local`. Umgebungsvariablen (siehe unten) trägst du in
`docker-compose.yml` unter `environment:` ein oder bindest sie dort mit `env_file:` ein.

Hinter einem Reverse-Proxy (z. B. Caddy oder Nginx) betreiben und `x-forwarded-for` nur von
diesem Proxy setzen lassen, weil das Rate-Limit die IP daraus liest.

### HTTP-Schnittstelle

`POST /api/check` mit `{ "names": ["wachwerk"], "tlds"?: [...], "namespaces"?: [...], "sources"?: [...] }`
liefert `{ ranking, reports }`. Höchstens 10 Namen, Body höchstens 16 KB, jeder Name zählt
einzeln fürs Rate-Limit. Details: [src/app/api/README.md](src/app/api/README.md).

## MCP-Server für Agenten

Vier Tools, alle schreibgeschützt und mit `outputSchema`:

| Tool | Eingabe | Ergebnis |
|---|---|---|
| `markenfrei_check_name` | `name`, optional `namespaces`, `tlds`, `sources` | Ampel, Status je Quelle, Lücken, Markenvorbereitung |
| `markenfrei_check_names` | `names` (1 bis 10), sonst wie oben | Rangliste und ein Bericht je Name |
| `markenfrei_trademark_prep` | `name`, optional `classes` (1 bis 45) | Registerlinks, DPMA-Expertensuchstring, Varianten, Klassen, Checkliste; ohne Netzabfrage |
| `markenfrei_suggest_names` | `keywords` (1 bis 6), optional `count` (1 bis 20) | ungeprüfte Kandidaten zum Weiterreichen an `markenfrei_check_names` |

### Über HTTP

Jede laufende Instanz stellt den Server unter `POST /api/mcp` bereit (Streamable HTTP,
zustandslos). Die öffentliche Adresse unten funktioniert erst nach dem Deployment auf
markenfrei.app (Stand 4. November 2026: noch nicht erreichbar); lokal ersetzt du sie durch
`http://localhost:3000/api/mcp`. Für Claude Code:

```bash
claude mcp add --transport http markenfrei https://markenfrei.app/api/mcp
```

Der Endpunkt lehnt Batch-Anfragen ab, nimmt höchstens 64 KB an und prüft den `Origin`-Header
(siehe `MARKENFREI_ALLOWED_ORIGINS` unten).

### Lokal über stdio

Das npm-Paket `markenfrei-mcp` liegt im Ordner [`mcp/`](mcp/README.md). Solange es noch nicht
veröffentlicht ist, funktioniert `npx -y markenfrei-mcp` nicht; dann das Bündel aus dem
Repository bauen und direkt starten:

```bash
npm run build:mcp
claude mcp add markenfrei -- node /pfad/zu/markenfrei/mcp/dist/markenfrei-mcp.mjs
```

Für Claude Desktop (`claude_desktop_config.json`) oder Cursor (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "markenfrei": {
      "command": "node",
      "args": ["/pfad/zu/markenfrei/mcp/dist/markenfrei-mcp.mjs"],
      "env": { "MARKENFREI_CONTACT": "mailto:du@example.org" }
    }
  }
}
```

Nach der Veröffentlichung ersetzt `"command": "npx", "args": ["-y", "markenfrei-mcp"]` den
lokalen Pfad. Weitere Varianten stehen in [mcp/README.md](mcp/README.md) und auf der Seite
`/mcp`.

## Umgebungsvariablen

Markenfrei braucht keine API-Schlüssel. Außer den Betreiberangaben (siehe unten) sind alle Variablen optional, eine Vorlage steht in
[`.env.example`](.env.example).

| Variable | Wirkung |
|---|---|
| `MARKENFREI_OPERATOR_NAME`, `MARKENFREI_OPERATOR_ADDRESS`, `MARKENFREI_OPERATOR_EMAIL`, `MARKENFREI_HOSTING_PROVIDER` | **Pflicht für den Livegang.** Betreiberangaben für Impressum (§ 5 DDG) und Datenschutzerklärung. `…_ADDRESS` mehrzeilig mit `\n`. Ohne sie zeigen `/impressum` und `/datenschutz` einen sichtbaren Hinweis. Optional: `MARKENFREI_OPERATOR_PHONE`. |
| `MARKENFREI_CONTACT` | Kontakt im User-Agent, z. B. `mailto:ops@example.org`. Der User-Agent lautet dann `Markenfrei/2.0 (+https://markenfrei.app; mailto:ops@example.org)`. Packagist wird nur mit einer E-Mail-Adresse abgefragt (mit oder ohne `mailto:`), sonst meldet die Quelle `unknown`. |
| `MARKENFREI_ALLOWED_ORIGINS` | Kommagetrennte Liste zusätzlicher Origins (z. B. `https://example.org`), die `/api/mcp` aufrufen dürfen. Ohne `Origin`-Header ist der Aufruf immer erlaubt; mit Header sind sonst nur der eigene Host, `localhost` und `127.0.0.1` erlaubt. |
| `GITHUB_TOKEN` | Token für die GitHub-Abfrage (Nutzer und Organisationen). Ohne Token gilt das Limit von 60 Anfragen pro Stunde und IP. Das Token braucht keine Berechtigungen. |
| `MARKENFREI_TRUSTED_PROXIES` | Anzahl vertrauenswürdiger Proxys vor der App (Standard 1). `x-forwarded-for` wird von rechts gelesen, damit Clients ihre Adresse nicht fälschen können. `0` ignoriert den Header. |
| `MARKENFREI_RATE_LIMIT` | Anfragen pro Minute und IP für alle öffentlichen Routen (Standard 60). Bei `/api/check` und `markenfrei_check_names` zählt jeder Name einzeln. Der Zähler gilt pro Serverprozess; bei mehreren Instanzen zusätzlich am Reverse-Proxy begrenzen. |
| `MARKENFREI_CACHE_TTL_SEC` | Lebensdauer des Zwischenspeichers für eindeutige Quellenantworten im Arbeitsspeicher, Standard 600 Sekunden, `0` schaltet ihn aus. `unknown` wird nie zwischengespeichert, nichts wird auf die Platte geschrieben. |

## Vor dem Livegang

Geprüft am 4. November 2026 (Sicherheit, Fehler, Quellen). Diese Punkte muss der Betreiber erledigen,
der Code allein reicht nicht:

1. **Betreiberangaben setzen** (`MARKENFREI_OPERATOR_*`, `MARKENFREI_HOSTING_PROVIDER`). Eine öffentliche
   deutsche Website braucht ein Impressum und eine Datenschutzerklärung. Der Text der Datenschutzerklärung
   beschreibt, was die Anwendung tatsächlich tut (keine Cookies, kein Browser-Speicher, keine Namen in
   Logs, Weitergabe an Drittdienste, Rate-Limit je IP). Lass ihn vor dem Livegang von einer fachkundigen
   Person prüfen; er ersetzt keine Rechtsberatung.
2. **HTTPS und Proxy.** `MARKENFREI_TRUSTED_PROXIES` auf die Zahl der Proxys vor der App setzen
   (Caddy oder nginx: 1). Die Anwendung setzt Security-Header (CSP, `nosniff`, `frame-ancestors 'none'`,
   `Referrer-Policy`, `Permissions-Policy`, HSTS). HSTS wirkt nur über HTTPS.
3. **Kontakt und Token.** `MARKENFREI_CONTACT` setzen (Wikidata verlangt Kontakt im User-Agent, Packagist
   auch) und möglichst `GITHUB_TOKEN`.
4. **Mehrere Instanzen:** Rate-Limit und Cache gelten pro Prozess. Bei mehr als einer Instanz zusätzlich am
   Proxy begrenzen.
5. **Node 22 oder neuer** (CI testet mit 22).
6. **Nutzungsbedingungen der Quellen.** Die App fragt Dienste Dritter ab. Eingehalten bzw. geprüft:
   Rate-Limits mit Abfragebudget je Dienst (Apple etwa 20 pro Minute, crates.io 1 pro Sekunde, Hex,
   Mastodon; `HOST_BUDGETS` in `src/lib/engine/http.ts`), identifizierbarer User-Agent, Pfade nicht
   durch `robots.txt` gesperrt. **Nicht geprüft oder offen:** Für DENIC (.de-RDAP) habe ich keine
   veröffentlichten Bedingungen gefunden, für Google Play (Abfrage der Detailseiten per HEAD) nicht die
   Nutzungsbedingungen gelesen. Bei SWITCH (.ch/.li) verweist die Antwort auf eine Acceptable Use Policy,
   die nach einem früheren Prüfbericht kommerzielle Zwecke ausschließt (nicht selbst gelesen).
   **Vor einem kostenpflichtigen Angebot** die Bedingungen jeder Quelle auf kommerzielle Nutzung prüfen.
7. **Kosten.** Es fallen keine Gebühren pro Abfrage bei Dritten an (alle Quellen sind schlüsselfrei und
   kostenlos). Kosten entstehen nur beim Hosting: Gemessen rund 16 Abfragen bei Dritten, 90 ms CPU,
   1,7 s Wartezeit, 8 KB Antwort pro Standardprüfung (1 Name, Standardquellen). Eine Million Prüfungen
   sind demnach etwa 25 CPU-Stunden, 470 Stunden Laufzeit (Wanduhr) und 16 GB Datenverkehr. Die Obergrenze
   setzt `MARKENFREI_GLOBAL_RATE_LIMIT` (Standard 600 Namen pro Minute und Prozess).
8. **Optional:** npm-Paket veröffentlichen (`cd mcp && npm publish`), damit `npx -y markenfrei-mcp` geht.

## Entwicklung

```bash
npm test               # Offline-Tests (node:test über tsx, Netz gestubbt)
npm run lint           # ESLint
npm run build          # Next.js-Build
npm run build:mcp      # MCP-Bündel nach mcp/dist/
npm run test:mcp-package  # npm pack und Start aus dem entpackten Paket
```

Aufbau und Beitragsregeln: [CONTRIBUTING.md](CONTRIBUTING.md). Weitere Dokumentation:

- [`src/README.md`](src/README.md): Aufbau und Datenfluss
- [`src/lib/README.md`](src/lib/README.md): Engine, Quellen und Hilfsmodule
- [`src/app/api/README.md`](src/app/api/README.md): HTTP-Routen
- [`docs/v2-spec.md`](docs/v2-spec.md): verbindliche Spezifikation
- [`ROADMAP.md`](ROADMAP.md): Stand und offene Punkte

Tech-Stack: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4,
MCP TypeScript SDK, zod.

## Rechtlicher Hinweis

Markenfrei dient der technischen Vorab-Recherche. Es ersetzt keine anwaltliche
Markenberatung und keine verbindliche Ähnlichkeitsrecherche.
