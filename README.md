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

Grundsätze: kein LLM im Produkt, keine Konten, kein Personen-Tracking (nur anonyme Seitenzählung ohne Cookies, ohne Namen), keine Speicherung von
Suchanfragen, nur offene Quellen ohne Schlüssel, nur Einzelabfragen, die ein Nutzer auslöst.

## Was geprüft wird

Standardmäßig aktiv (Web und MCP gleich):

| Namensraum | Quellen |
|---|---|
| Domains | RDAP für die gewählten Endungen (Standard `.de`, `.com`, `.dev`, `.app`, `.io`, höchstens 8 je Prüfung). Der RDAP-Server kommt aus dem IANA-Bootstrap, für `.de`, `.io`, `.ch` und `.li` aus festen Einträgen. `.at` und `.eu` laufen nur über DNS und können deshalb nie „nicht gefunden“ ergeben. DNS über HTTPS bestätigt nur „vergeben“. |
| Pakete | npm, PyPI, GitHub (Nutzer oder Organisation), crates.io, Homebrew (Formula und Cask) |
| App Stores | Apple App Store Deutschland (Suche, vergeben nur bei exakt gleichem Haupttitel), Google Play (nur die Bundle-IDs `com.<name>.app` und `de.<name>.app`) |
| Bekannte Namen | Liste bekannter Tech-Marken (Heuristik ohne Netz: identisch, klanggleich nach Kölner Phonetik, enthalten), Wikidata (exaktes Label mit Typ Unternehmen, Marke, Software oder App), GLEIF (aktive Rechtsträger mit LEI, Namensstamm ohne Rechtsform) |

Auf Wunsch („Weitere Quellen“ in der Oberfläche, `sources` in API und MCP): NuGet,
RubyGems, Maven Central, Packagist, pub.dev, JSR, Hex.pm, CRAN, Open VSX, Hugging Face
(Organisationen und Nutzer), Hackage (auch bei anderer Schreibweise), Terraform Registry
(Namespaces), DEV (dev.to, Nutzer und Organisationen), AUR, Repology (Projektname in rund 300
Paketquellen von Distributionen, Homebrew, winget und weiteren), Docker Hub (nur offizielle
Images), conda-forge und Clojars (diese drei über den Index von ecosyste.ms, nicht live aus dem
Register; CocoaPods, CPAN und Julia fehlen bewusst, weil ihre Namen die Schreibweise brauchen),
F-Droid, Firefox Add-ons, Bluesky, Mastodon (mastodon.social), Hacker News sowie Wikipedia und
Show HN als schwache Signale. Für Instagram, TikTok, X, YouTube und den Chrome Web Store
gibt es nur Links zur Prüfung von Hand.

**Achtung bei `sources`:** Die Liste ersetzt die Standardquellen außerhalb von Domains, sie
ergänzt sie nicht. `sources: ["nuget"]` prüft nur noch die Domains und NuGet. Wer Quellen
hinzufügen will, schickt die Standardquellen-IDs mit: `npm`, `pypi`, `github`, `crates`,
`homebrew`, `appstore`, `googleplay`, `known_brands`, `wikidata`, `gleif`, dazu die
gewünschten Zusatzquellen. Alle IDs stehen auf der Seite `/quellen`.

Alle 33 Endungen und alle Quellen mit Endpunkt stehen auf der Seite `/quellen`.

Anleitungen mit eingebettetem Prüfer: `/domain-pruefen`, `/paketname-pruefen`, `/app-name-pruefen` und `/markenrecherche-vorbereiten`.

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
- **Keine Gewährleistung, keine Haftung für die Ergebnisse.** Markenfrei wird wie besehen
  bereitgestellt ([MIT-Lizenz](LICENSE)); die Haftung bei Vorsatz, grober Fahrlässigkeit und nach
  zwingenden gesetzlichen Vorschriften bleibt unberührt.

## Start

Voraussetzung: Node.js 20.9 oder neuer.

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

Der Container liest keine `.env.local`. `docker-compose.yml` übernimmt eine Datei `.env` im
Projektordner (Vorlage: `.env.example`, siehe unten) oder die Einträge unter `environment:`.

Der Port 3000 ist nur an `127.0.0.1` gebunden. Betreibe die App hinter einem Reverse-Proxy
(z. B. Caddy oder Nginx) auf demselben Rechner, der TLS terminiert und `x-forwarded-for` setzt, weil das
Rate-Limit die IP daraus liest. Eine Caddy-Konfiguration:

```caddy
markenfrei.app {
    reverse_proxy 127.0.0.1:3000
}
```

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
zustandslos). Die öffentliche Adresse unten ist unter markenfrei.app erreichbar; lokal ersetzt du sie durch
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
| `MARKENFREI_SMTP_URL`, `MARKENFREI_CONTACT_TO`, `MARKENFREI_CONTACT_FROM` | **Kontaktformular** (`/kontakt`, `POST /api/contact`), der zweite schnelle Kontaktweg neben der E-Mail-Adresse im Impressum. Ohne `MARKENFREI_SMTP_URL` zeigt `/kontakt` „Das Kontaktformular ist gerade nicht verfügbar“ mit der E-Mail-Adresse des Betreibers. Format: `smtps://Benutzer:Passwort@mail.example.org:465` (TLS von Anfang an) oder `smtp://Benutzer:Passwort@mail.example.org:587` (STARTTLS Pflicht); Sonderzeichen URL-kodieren (`@` als `%40`). Unverschlüsseltes `smtp://` ist nur zu `localhost`, `127.0.0.1` und `[::1]` erlaubt, zu anderen Hosts nur auf Port 587. Das Passwort gehört zu einem **eigens dafür angelegten Postfach** (nur Versand), nicht zum Hauptpostfach. `MARKENFREI_CONTACT_TO`: Empfänger, Standard `MARKENFREI_OPERATOR_EMAIL`. `MARKENFREI_CONTACT_FROM`: Absender, Standard der SMTP-Benutzer (wenn er eine Adresse ist), sonst der Empfänger. Absender ist nie die Adresse des Besuchers (sie steht in `Reply-To`), sonst scheitern SPF und DMARC. Name, Adresse und Text werden weder gespeichert noch protokolliert (bei einem Versandfehler erscheint nur ein Fehlercode wie `EAUTH` im Log); höchstens 3 Nachrichten pro Stunde und IP, 30 pro Stunde und Prozess. Mit eingerichtetem Formular entfällt die Empfehlung „zweiter Kontaktweg“ im Impressum. |
| `MARKENFREI_CONTACT` | Kontakt im User-Agent, z. B. `mailto:ops@example.org`. Der User-Agent lautet dann `Markenfrei/2.0 (+https://markenfrei.app; mailto:ops@example.org)`. Packagist wird nur mit einer E-Mail-Adresse abgefragt (mit oder ohne `mailto:`), sonst meldet die Quelle `unknown`. |
| `MARKENFREI_ALLOWED_ORIGINS` | Kommagetrennte Liste zusätzlicher Origins (z. B. `https://example.org`), die `/api/mcp` aufrufen dürfen. Ohne `Origin`-Header ist der Aufruf immer erlaubt; mit Header sind sonst nur der eigene Host, `localhost` und `127.0.0.1` erlaubt. |
| `HF_TOKEN` | Optionales Lese-Token für Hugging Face (nur für die optionale Quelle „Hugging Face“). Hebt das Limit von 500 auf 1.000 API-Abfragen je 5 Minuten (Free-Konto, Stand September 2025). Geht nur an huggingface.co. |
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
   Mastodon, Repology 1 pro Sekunde, ecosyste.ms, AUR; `HOST_BUDGETS` in `src/lib/engine/http.ts`),
   identifizierbarer User-Agent (für Repology der geforderte mit Link zum Quellcode), Pfade nicht
   durch `robots.txt` gesperrt. Die Quellen docker, conda und clojars fragen den
   Index von ecosyste.ms ab (offene API, `mailto` im User-Agent hebt das Limit von 5.000 auf 15.000 je Stunde),
   nicht die Register selbst. **Nicht geprüft oder offen:** Für DENIC (.de-RDAP) habe ich keine
   veröffentlichten Bedingungen gefunden, für Google Play (Abfrage der Detailseiten per HEAD) nicht die
   Nutzungsbedingungen gelesen. Bei SWITCH (.ch/.li) verweist die Antwort auf eine Acceptable Use Policy,
   die nach einem früheren Prüfbericht kommerzielle Zwecke ausschließt (nicht selbst gelesen).
   **Vor einem kostenpflichtigen Angebot** die Bedingungen jeder Quelle auf kommerzielle Nutzung prüfen.
7. **Kosten.** Es fallen keine Gebühren pro Abfrage bei Dritten an (alle Quellen sind schlüsselfrei und
   kostenlos). Kosten entstehen nur beim Hosting: Gemessen rund 16 Abfragen bei Dritten, 90 ms CPU,
   1,7 s Wartezeit, 8 KB Antwort pro Standardprüfung (1 Name, Standardquellen). Eine Million Prüfungen
   sind demnach etwa 25 CPU-Stunden, 470 Stunden Laufzeit (Wanduhr) und 16 GB Datenverkehr. Die Obergrenze
   setzt `MARKENFREI_GLOBAL_RATE_LIMIT` (Standard 600 Namen pro Minute und Prozess).
8. **Kapazität.** Gemessen und simuliert (feste Antwortzeit der Dienste von 300 ms, Abfragen bei Dritten
   gestubbt), nicht mit echtem Verkehr getestet:
   - Der Server selbst ist nicht der Engpass: eine Prüfung braucht etwa 90 ms CPU (mit TLS) und der Prozess rund
     120 MB bei 80 gleichzeitigen Prüfungen. Jede Instanz mit 1 vCPU und 1 GB RAM reicht, die Größe des Servers
     verändert die Kapazität kaum.
   - Die Grenze setzt die Zahl gleichzeitiger Abfragen je Zieldienst (4 je Host, `PER_HOST_LIMIT` in
     `src/lib/engine/http.ts`): etwa **4 bis 5 Prüfungen pro Sekunde**. Bis etwa 20 gleichzeitige Prüfungen dauert eine
     im Median 4,5 s, ab etwa 40 laufen sie in die Frist von 8 s und liefern Lücken.
   - Enger sind die Grenzen der Dienste: **Apple ca. 18 neue Namen pro Minute** (Budget, siehe oben) und
     **GitHub ohne Token 60 neue Namen pro Stunde** je Server-IP (mit Token 5.000). Wiederholte Namen kommen aus dem
     Zwischenspeicher (10 Minuten) und zählen nicht. Setze `GITHUB_TOKEN`, sonst ist die GitHub-Zeile nach 60 neuen
     Namen pro Stunde für alle Nutzer „unbekannt“.
   - Mehr Instanzen auf derselben IP erhöhen diese Grenzen nicht, sie teilen sie sich und überschreiten sie
     eher (Budgets gelten pro Prozess).
9. **Optional:** npm-Paket veröffentlichen (`cd mcp && npm publish`), damit `npx -y markenfrei-mcp` geht.

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
- [`docs/design.md`](docs/design.md): Entscheidungsvorlage zum Betrieb mit mehreren Prozessen
- [`ROADMAP.md`](ROADMAP.md): Stand und offene Punkte

Tech-Stack: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4,
MCP TypeScript SDK, zod.

## Rechtlicher Hinweis

Markenfrei dient der technischen Vorab-Recherche. Es ersetzt keine anwaltliche
Markenberatung und keine verbindliche Ähnlichkeitsrecherche.
