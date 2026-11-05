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
| `markenfrei_check_name` | `name`, optional `namespaces`, `tlds`, `sources` | Ampel, Status je Quelle mit Link zum Nachprüfen (wo es einen gibt), Lücken, Markenvorbereitung |
| `markenfrei_check_names` | `names` (1 bis 10), sonst wie oben | Rangliste der Kandidaten und ein Bericht je Name |
| `markenfrei_trademark_prep` | `name`, optional `classes` (Nizza 1 bis 45) | Links zu DPMAregister, TMview, EUIPO, WIPO, TMDB und USPTO, DPMA-Expertensuchstring, Schreibvarianten, Klassen, Checkliste; ohne Netzabfrage |
| `markenfrei_suggest_names` | `keywords` (1 bis 6), optional `count` (1 bis 20) | ungeprüfte Kandidaten aus dem Wortfeld (OpenThesaurus, Datamuse, feste Regeln), zum Weiterreichen an `markenfrei_check_names` |

Namensräume: `domains`, `packages`, `stores`, `known_names` (Standard) und `social` (nur auf
Wunsch). Standard-Endungen: .de, .com, .dev, .app, .io; höchstens 8 je Prüfung.

`sources` ersetzt die Standardquellen außerhalb von Domains, es ergänzt sie nicht.
`sources: ["nuget"]` prüft nur noch Domains und NuGet. Für Zusatzquellen die
Standardquellen-IDs mitschicken: `npm`, `pypi`, `github`, `crates`, `homebrew`, `appstore`,
`googleplay`, `known_brands`, `wikidata`, `gleif`.

Status je Quelle:

- `taken`: vergeben
- `not_found`: die Quelle kennt den Namen nicht; das heißt nicht, dass er registrierbar ist
- `similar`: ähnlicher Treffer
- `invalid`: dort nicht zulässig
- `unknown`: keine verwertbare Antwort; nie als frei werten

Jedes Ergebnis hat zusätzlich `structuredContent` passend zum `outputSchema` des Tools.

## Umgebungsvariablen

| Variable | Wirkung |
|---|---|
| `MARKENFREI_CONTACT` | Kontakt im User-Agent, z. B. `mailto:du@example.org`. Der User-Agent lautet dann `Markenfrei/2.0 (+https://markenfrei.app; mailto:du@example.org)`. Packagist wird nur mit einer E-Mail-Adresse abgefragt (mit oder ohne `mailto:`), sonst ist das Ergebnis `unknown`. |
| `GITHUB_TOKEN` | Optionales GitHub-Token für die Abfrage von Nutzern und Organisationen. Ohne Token gilt das GitHub-Limit von 60 Anfragen pro Stunde und IP; danach meldet die Quelle `unknown`. Das Token braucht keine Berechtigungen. |
| `MARKENFREI_CACHE_TTL_SEC` | Lebensdauer des Zwischenspeichers im Arbeitsspeicher, Standard 600 Sekunden. `0` schaltet ihn aus. Nichts wird auf die Platte geschrieben. |

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
