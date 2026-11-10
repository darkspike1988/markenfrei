# markenfrei-mcp

MCP-Server von [Markenfrei](https://markenfrei.app) für KI-Agenten. Er prüft einen Namen,
bevor ein Projekt, Paket, Repo, App-Eintrag oder eine Domain angelegt wird: Domains (RDAP),
Paketregister, App Stores und bekannte Namen. Dazu bereitet er die Markenrecherche vor.

- Deterministisch: kein LLM, feste Regeln und offene Quellen.
- Keine Konten, kein Tracking, keine Speicherung der Anfragen.
- Eine einzige Datei ohne Laufzeitabhängigkeiten, Node.js 20 oder neuer.

<!-- mcp-name: app.markenfrei/mcp -->

## Installation

### Claude Code

```sh
claude mcp add markenfrei -- npx -y markenfrei-mcp
```

Mit Kontakt für den User-Agent (empfohlen, siehe unten):

```sh
claude mcp add markenfrei -e MARKENFREI_CONTACT=mailto:du@example.org -- npx -y markenfrei-mcp
```

### Claude Desktop

In `claude_desktop_config.json` eintragen (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`, Windows:
`%APPDATA%\Claude\claude_desktop_config.json`) und Claude Desktop neu starten:

```json
{
  "mcpServers": {
    "markenfrei": {
      "command": "npx",
      "args": ["-y", "markenfrei-mcp"],
      "env": {
        "MARKENFREI_CONTACT": "mailto:du@example.org"
      }
    }
  }
}
```

### Cursor

In `~/.cursor/mcp.json` (für alle Projekte) oder `.cursor/mcp.json` (nur dieses Projekt):

```json
{
  "mcpServers": {
    "markenfrei": {
      "command": "npx",
      "args": ["-y", "markenfrei-mcp"]
    }
  }
}
```

### Ohne Installation

Derselbe Server läuft auch über HTTP unter `/api/mcp` jeder Markenfrei-Instanz (MCP Streamable
HTTP, zustandslos, mit Rate-Limit). Die öffentliche Adresse `https://markenfrei.app/api/mcp` ist
erreichbar:

```sh
claude mcp add --transport http markenfrei https://markenfrei.app/api/mcp
```

## Tools

| Tool | Eingabe | Ergebnis |
|---|---|---|
| `markenfrei_check_name` | `name`, optional `profile`, `namespaces`, `tlds`, `sources` | Ampel, Status je Quelle mit Link zum Nachprüfen (wo es einen gibt), Lücken, Markenvorbereitung |
| `markenfrei_check_names` | `names` (1 bis 10), sonst wie oben | Rangliste der Kandidaten und ein Bericht je Name |
| `markenfrei_trademark_prep` | `name`, optional `classes` (Nizza 1 bis 45) | Links zu DPMAregister, TMview, EUIPO, WIPO, TMDB und USPTO, DPMA-Expertensuchstring, Schreibvarianten, Klassen, Checkliste; ohne Netzabfrage |
| `markenfrei_suggest_names` | `keywords` (1 bis 6), optional `count` (1 bis 20) | ungeprüfte Kandidaten aus dem Wortfeld (OpenThesaurus, Datamuse, feste Regeln), zum Weiterreichen an `markenfrei_check_names` |

### Profile

`profile` wählt Namensräume, Quellen und Endungen in einem Wort, z. B.
`{ "names": ["wachwerk", "fokusnova"], "profile": "npm" }`. Ausdrücklich angegebene `tlds` oder
`sources` ersetzen den jeweiligen Teil des Profils; ausdrückliche `namespaces` behalten Quellen und
Endungen des Profils nur in den gewählten Namensräumen. Jedes Profil außer `allgemein` prüft
zusätzlich `known_brands`, `wikidata` und `gleif`.

| Profil | Vorhaben | Prüft |
|---|---|---|
| `allgemein` | Allgemein | Standardauswahl |
| `web-app` | Web-App | Domains .com .de .app .io .dev .net, npm, github |
| `mobile-app` | Mobile-App | Domains .com .de .app, appstore, googleplay |
| `npm` | npm-Paket | npm, jsr, github |
| `python` | Python-Paket | pypi, conda, github |
| `rust` | Rust-Crate | crates, github |
| `dart` | Dart/Flutter-Paket | pub, github |
| `php` | PHP-Paket | packagist, github |
| `ruby` | Ruby-Gem | rubygems, github |
| `dotnet` | .NET-Paket | nuget, github |
| `java` | Java-Bibliothek | maven, github |
| `cli` | Kommandozeile | homebrew, aur, repology, npm, crates, pypi, github |

### Ablauf für Agenten

1. Aufrufen, bevor ein Projekt, Paket, eine App, ein Repository oder eine Domain angelegt oder
   benannt wird, und wenn der Nutzer Namensideen will.
2. 5 bis 10 Kandidaten sammeln (eigene Ideen, optional `markenfrei_suggest_names`) und alle
   zusammen mit `markenfrei_check_names` und dem passenden `profile` prüfen.
3. Namen ohne Treffer bevorzugen. Gelb und `unknown` gelten als nicht geklärt; kein Name wird
   „frei“ genannt.
4. Marken sind nicht geprüft: das sagen und `markenfrei_trademark_prep` anbieten.
5. Steht im Ergebnis ein Registrierungs-Link („Domain registrieren“, Feld `register`), ist das ein
   Angebot des Betreibers der Instanz, an dem er verdienen kann. Der Agent zeigt den Link mit dem
   Hinweis und bestellt nichts selbst.

### Anweisung für AGENTS.md oder CLAUDE.md

Diesen Abschnitt in die Anweisungsdatei eines Projekts kopieren:

```markdown
## Namen prüfen mit Markenfrei

Bevor du ein Projekt, Paket, eine App, ein Repository oder eine Domain anlegst oder benennst, prüfe den Namen mit dem MCP-Server „markenfrei“:

1. Sammle 5 bis 10 Kandidaten (eigene Ideen, optional markenfrei_suggest_names).
2. Prüfe alle zusammen mit markenfrei_check_names und dem passenden profile, z. B. "npm", "python", "rust" oder "web-app".
3. Bevorzuge Namen ohne Treffer. Gelb und unknown gelten als nicht geklärt. Nenne keinen Namen „frei“.
4. Sag mir, dass Marken nicht geprüft sind, und biete markenfrei_trademark_prep an.
5. Zeigt das Ergebnis einen Registrierungs-Link, gib ihn mit dem Hinweis an mich weiter. Bestelle nichts selbst.
```

English:

```markdown
## Check names with Markenfrei

Before you create or name a project, package, app, repository or domain, check the name with the "markenfrei" MCP server:

1. Collect 5 to 10 candidates (your own ideas, optionally markenfrei_suggest_names).
2. Check them together with markenfrei_check_names and the matching profile, e.g. "npm", "python", "rust" or "web-app".
3. Prefer names without any hit. Treat yellow and unknown as not cleared. Never call a name "free" or "available".
4. Tell me that trade marks were not checked and offer markenfrei_trademark_prep.
5. If the result contains a registration link, pass it on to me with its notice. Do not order anything yourself.
```

### Namensräume und Quellen

Namensräume: `domains`, `packages`, `stores`, `known_names` (Standard) und `social` (nur auf
Wunsch). Standard-Endungen: .de, .com, .dev, .app, .io; höchstens 8 je Prüfung. Gültig sind alle Endungen mit RDAP-Server im IANA-Bootstrap sowie at und eu (Liste: `GET /api/sources`); nur 33 sind einzeln geprüft, bei den übrigen ergibt RDAP-404 „unbekannt“.

`sources` ersetzt die Standardquellen außerhalb von Domains, es ergänzt sie nicht.
`sources: ["nuget"]` prüft nur noch Domains und NuGet. Für Zusatzquellen die
Standardquellen-IDs mitschicken: `npm`, `pypi`, `github`, `crates`, `homebrew`, `appstore`,
`googleplay`, `known_brands`, `wikidata`, `gleif`.

Der App Store wird standardmäßig nur in Deutschland durchsucht. Auf Wunsch gibt es
`appstore_at` (Österreich), `appstore_ch` (Schweiz) und `appstore_us` (USA); sie teilen sich
das Abfragelimit von Apple mit dem deutschen Store.

Status je Quelle:

- `taken`: vergeben
- `not_found`: die Quelle kennt den Namen nicht; das heißt nicht, dass er registrierbar ist
- `similar`: ähnlicher Treffer
- `invalid`: dort nicht zulässig
- `unknown`: keine verwertbare Antwort; nie als frei werten

Jedes Ergebnis hat zusätzlich `structuredContent` passend zum `outputSchema` des Tools.

Registrierungs-Link: Ist `MARKENFREI_REGISTER_URL` mit `MARKENFREI_REGISTER_NAME` gesetzt (bei
`/api/mcp` durch den Betreiber der Instanz), tragen Domains einzeln geprüfter Endungen mit
`not_found` das Feld `register` (`label`, `url`, `notice`); der Text zeigt sie als
„Domain registrieren (Angebot des Betreibers, vergütet)“. Ohne diese Einstellung gibt es keinen Link.

## Umgebungsvariablen

| Variable | Wirkung |
|---|---|
| `MARKENFREI_CONTACT` | Kontakt im User-Agent, z. B. `mailto:du@example.org`. Der User-Agent lautet dann `Markenfrei/2.0 (+https://markenfrei.app; mailto:du@example.org)`. Packagist wird nur mit einer E-Mail-Adresse abgefragt (mit oder ohne `mailto:`), sonst ist das Ergebnis `unknown`. |
| `GITHUB_TOKEN` | Optionales GitHub-Token für die Abfrage von Nutzern und Organisationen. Ohne Token gilt das GitHub-Limit von 60 Anfragen pro Stunde und IP; danach meldet die Quelle `unknown`. Das Token braucht keine Berechtigungen. |
| `MARKENFREI_CACHE_TTL_SEC` | Lebensdauer des Zwischenspeichers im Arbeitsspeicher, Standard 600 Sekunden. `0` schaltet ihn aus. Nichts wird auf die Platte geschrieben. |
| `MARKENFREI_REGISTER_URL`, `MARKENFREI_REGISTER_NAME` | Optional und standardmäßig aus: eigener Registrierungs-Link bei Domains mit `not_found` (https-Vorlage mit `{domain}`, Name höchstens 60 Zeichen; Einzelheiten im README des Repositorys). |

## Grenzen

- **Keine Markenprüfung.** Markenregister werden nicht abgefragt, die Marke ist immer
  „nicht geprüft“. `markenfrei_trademark_prep` liefert Links und Suchstrings für die eigene
  Recherche; vor einer Anmeldung oder Nutzung gehört eine fachkundige Prüfung dazu.
- **Grün heißt nur: nichts gefunden.** Die Ampel bewertet die gewählten Quellen. „Nicht
  gefunden“ ist keine Freigabe, und `unknown` bedeutet, dass die Antwort fehlt.
- **Netz nötig.** Bis auf `markenfrei_trademark_prep` fragen alle Tools öffentliche Dienste
  ab. Die Anfragen gehen direkt von deinem Rechner an die Quellen (RDAP-Server, Register,
  Stores, Wikidata, GLEIF und andere); diese sehen den geprüften Namen und deine IP-Adresse.
- **Zeitgrenze.** Eine Prüfung dauert höchstens etwa 8 Sekunden. Langsame Quellen landen
  dann als `unknown` in den Lücken.
- **Mengen.** Höchstens 10 Namen pro `markenfrei_check_names` und 8 Domain-Endungen pro
  Prüfung. Social-Plattformen ohne offene Schnittstelle (Instagram, TikTok, X, YouTube)
  gibt es nur als Links zur Prüfung von Hand.

## Lizenz

MIT. Die Lizenzen der eingebündelten Pakete stehen in `dist/THIRD_PARTY_LICENSES.txt`.
Quellcode und Fehlermeldungen: <https://github.com/darkspike1988/markenfrei>.
