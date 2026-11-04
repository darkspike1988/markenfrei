# Markenfrei 🛡️✨

[![CI](https://github.com/darkspike1988/markenfrei/actions/workflows/ci.yml/badge.svg)](https://github.com/darkspike1988/markenfrei/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live](https://img.shields.io/badge/Live-markenfrei.app-black?logo=safari&logoColor=white)](https://markenfrei.app)

**Markenfrei** ([markenfrei.app](https://markenfrei.app)) ist ein minimalistisches, hochperformantes Open-Source Clearinghouse zur Vorab-Prüfung und Generierung unbedenklicher Namen für **Apps, Websites, SaaS-Tools und Bibliotheken**.

Das Tool prüft Namen und App-Identitäten in Echtzeit gegen **Marken-Kollisionen, phonetische Zwillinge (§ 9 MarkenG), deutsches Freihaltebedürfnis (§ 8 MarkenG), Apple & Google Play Werktitelschutz (§ 5 Abs. 3 MarkenG), autoritative Registries (Europa, Amerika, Asien), DoH, Enzyklopädien (Wikipedia & DuckDuckGo), globale Entwickler-Namensräume (GitHub, npm, PyPI, Crates.io, Homebrew, Go Proxy) und liefert einen transparenten Preisvergleich für europäische und amerikanische Hoster ohne Lockvogel-Fallen**.

**Was geplant ist, was schon geprüft wird und wo die Grenzen liegen:** siehe [ROADMAP.md](ROADMAP.md).

Inspiriert von wegweisenden GitHub-Projekten wie `facundoolano/app-store-scraper`, `DunlapCoddingPC/pyUSPTO`, `r13i/dodomains`, `faizul666/domain-search-agent` und REA (Reverse Engineering Anything).

---

## ⚡ Kernfunktionen

### 1. Minimalistischer Omnibar & Smart Intent Detection
* **Ein einziges Eingabefeld (Linear/Raycast Ästhetik):**
  * **Einzelname:** Gibt man ein einzelnes Wort ein (z. B. `Wachwerk`), startet die Sofort-Einzelprüfung in unter 500 ms.
  * **Projektidee:** Gibt man eine Beschreibung ein (z. B. `Wachbuch und Schichtplaner für Rettungsdienst`), generiert Markenfrei passende Kunstwörter, Portmanteaus und prüft sie im Batch.
  * **Zufalls-Beispiele:** Generiert dynamisch 5 zufällige Kunstnamen aus dem Open-Data-Morphem-Pool (inkl. 1-Klick-Shuffle).
  * **App Bundle-ID & Paket-Inspektor:** Gibt man eine Bundle-ID ein (z. B. `de.wachwerk.app`), wird die Identität auf Apple App Store und Google Play abgeglichen.
* **Shareable URL-State:**
  * Jede Recherche wird live synchronisiert (`?q=...`) und kann per 1-Klick-Share-Link geteilt oder als Markdown-Bericht exportiert werden.

---

### 2. Rechtliche Marken- & Werktitel-Vorprüfung (§ 5, § 8 & § 9 MarkenG)
* **Kölner Phonetik & Soundex:**
  * Berechnet den offiziellen deutschen Klangcode nach Hans Joachim Postel.
  * Erkennt phonetische Verwechslungsgefahr (z. B. *Klarna* vs. *Clarna*).
  * Generiert **phonetische Zwillinge** (c/k, v/f, z/s, ai/ei) zur automatischen Gegenprüfung.
* **Prüfung auf Freihaltebedürfnis (§ 8 MarkenG):**
  * Erkennt rein beschreibende Gattungsbegriffe (*Planer, Tracker, Tool, App*) und stuft Fantasienamen vs. beschreibende Begriffe ein.
* **Mobile App Stores & Werktitelschutz (§ 5 Abs. 3 MarkenG):**
  * Prüft live über die **Apple iTunes Search API** nach gleichnamigen Apps im deutschen Store.
  * Prüft **Google Play Store** auf Paket-Kollisionen.
  * Generiert und verifiziert kanonische Reverse-DNS-Bundle-IDs (`de.<name>.app`, `com.<name>.app`, `io.<name>.app`).
* **REA (Reverse Engineering Anything) Shipped-Artifact Bridge (`/api/rea-inspect`):**
  * Kann lokale macOS/iOS `.app`-Bundles, `Info.plist`-Dateien oder Android-Paketnamen analysieren und `CFBundleIdentifier`, `CFBundleDisplayName`, `version` und Mindest-OS extrahieren.
* **Nizza-Klassen & Amtsgebühren-Kalkulator:**
  * Empfiehlt automatisch Nizza-Klassen mit offiziellem Wortlaut (Klasse 9 für Software/Apps, Klasse 42 für SaaS, Klasse 35 für Business/Marktplätze, Klasse 44 für Gesundheit).
  * Zeigt offizielle Amtsgebühren:
    * **DPMA (DE):** 290 € (elektronisch, bis zu 3 Klassen inklusive)
    * **EUIPO (EU):** 850 € (1. Klasse) + 50 € (2. Klasse) + 150 € (ab 3. Klasse) – EU-weiter Schutz
    * **USPTO (US):** 250 $ - 350 $ pro Klasse (TEAS)
* **Amtliche Register-Deep-Links:**
  * Fertiger **DPMAregister-Expertensuchstring** per 1-Klick kopierbar.
  * Direkte Suchlinks zu **DPMAregister**, **TMview (EU & DE)**, **EUIPO eSearch**, **WIPO Global Brand DB**, **USPTO TSDR**, **Handelsregister / Unternehmensregister** und **OffeneRegister.de**.

---

### 3. Domain-Preisvergleich & Hosting (Günstigste Registrare)
* **Transparenter Dauerpreis-Vergleich:**
  * Vergleicht für jede geprüfte TLD (`.de`, `.com`, `.app`, `.ai`, `.io`, `.dev`) die tatsächlichen Kosten der führenden Anbieter (Netcup, Hetzner, Cloudflare, Porkbun, INWX, IONOS, Namecheap).
* **Entlarvt Lockvogel-Fallen:**
  * Warnt transparent vor 1-Euro-Angeboten, die sich ab dem zweiten Jahr verfünfzehnfachen (z. B. IONOS 1 € -> 15 € oder 22 €).
* **At-Cost Großhandels-Empfehlung:**
  * Hebt Großhandelspreise ohne Aufschlag hervor (z. B. Cloudflare Registrar mit 0 $ Markup für `.com` und `.app`).
* **Beste Konditionen nach TLD:**
  * `.de`: **Netcup** (0,42 €/Monat = 5,04 €/Jahr) & **Hetzner** (5,95 €/Jahr)
  * `.com`: **Porkbun** (9,55 €/Jahr) & **Cloudflare** (9,60 €/Jahr At-Cost)
  * `.app`: **Porkbun** (12,80 €/Jahr) & **Cloudflare** (12,90 €/Jahr At-Cost)
  * `.io` / `.ai`: **Porkbun** (32,10 € für .io, 63,50 € für .ai)
* **Direktlinks:** 1-Klick-Links direkt zum jeweiligen Registrar mit vorausgefülltem Domainnamen.

---

### 4. Wissensdatenbanken & Enzyklopädie-Prüfung
* **Wikipedia Page Summary REST API:**
  * Prüft live über `de.wikipedia.org/api/rest_v1/page/summary/`, ob ein gleichnamiger enzyklopädischer Artikel existiert, und zeigt Kurzbeschreibung und Direktlink.
* **DuckDuckGo Instant Answer API:**
  * Prüft die freie Zero-Click-Schnittstelle von DuckDuckGo auf bekannte Entitäten, Infoboxen und Markenbeschreibungen.
* **Wikidata Entity Search API:**
  * Durchsucht strukturierte Wikidata-Objekte nach Firmen, Software, Brands und Services.

---

### 5. Autoritative Registries & Fail-Safe Invariant
* **Autoritative RDAP-Endpunkte (kein rdap.org-Proxy):**
  * `.de`: Direkt über `https://rdap.denic.de/domain/`
  * `.com` / `.net`: Direkt über Verisign `https://rdap.verisign.com/`
  * `.app` / `.dev`: Direkt über Google Registry `https://pubapi.registry.google/`
  * `.io` / `.ai`: Direkt über Identity Digital `https://rdap.identitydigital.services/`
* **Dual-Layer DNS-over-HTTPS (DoH) Fallback:**
  * Falls ein RDAP-Server 429 oder einen Timeout meldet, verifiziert Markenfrei die Existenz von NS- und SOA-Einträgen über Google & Cloudflare DoH.
* **Fail-Safe Invariante:**
  * War eine Quelle nicht erreichbar, wird sie als `unknown` und nie als `available` gewertet. Ein grünes Signal gibt es nur bei vollständiger Prüfung.

---

### 6. Entwickler-Ökosysteme & Paketmanager
* **GitHub:** Nutzer-/Org-Handle Verfügbarkeit + Suche nach bekannten Repositories mit Stars.
* **npm:** JavaScript/TypeScript Paket-Namensraum (`registry.npmjs.org`).
* **PyPI:** Python Package Index (`pypi.org`).
* **Crates.io:** Rust Cargo Paket-Namensraum (`crates.io/api/v1/crates/`).
* **Homebrew:** macOS/Linux Formula Namensraum (`formulae.brew.sh`).
* **Go Proxy:** Globaler Go Modul-Namensraum (`proxy.golang.org`).

---

### 7. Verwendete Open APIs & Quellen-Transparenz (Europa, Amerika, Asien)
Über den Button **„Infos & MCP“** im Header zeigt Markenfrei alle verwendeten weltweiten Schnittstellen übersichtlich an:
* **Live abgefragt:** RDAP-Registries (DENIC, NIC.fr, Nominet, Verisign, Google Registry, Identity Digital, KRNIC), DNS-over-HTTPS (Google, Cloudflare), Apple iTunes, Google Play, Wikidata, Wikipedia, DuckDuckGo, GitHub, npm, PyPI, crates.io, Homebrew, Go-Proxy, OpenThesaurus und Datamuse.
* **Nur Verweise, keine Abfrage:** DPMAregister, TMview, EUIPO eSearch, OffeneRegister, USPTO und WIPO Global Brand Database. Das Tool prüft also keine Markenregister, sondern verlinkt sie für die manuelle Recherche.
* Endpoint-URL, Region, Protokoll (RDAP, DoH, REST, Deep-Link) und Dokumentationslinks.

---

### 8. 🤖 Model Context Protocol (MCP) Server für KI-Agenten
Markenfrei liefert einen voll ausgestatteten **MCP-Server**, mit dem autonome KI-Agenten (Claude Desktop, Claude Code, Cursor, Codex, Gemini CLI / Antigravity, Windsurf) direkt Markennamen prüfen, Domains vergleichen und Namensideen generieren können:

#### Integration in Claude Desktop (`claude_desktop_config.json`) oder Cursor (`.cursor/mcp.json`):
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

Oder lokal aus dem Repository:
```json
{
  "mcpServers": {
    "markenfrei": {
      "command": "node",
      "args": ["./bin/markenfrei-mcp.mjs"]
    }
  }
}
```

#### Bereitgestellte MCP-Tools:
1. `markenfrei_clearance_check`: Vollständige Prüfung auf Markenrecht (§ 8, § 9), Phonetik, App Stores (§ 5 Abs. 3 MarkenG), Domains (.de, .com, .app) und GitHub/npm.
2. `markenfrei_domain_pricing`: Vergleicht Netcup, Hetzner, Cloudflare Wholesale & warnt vor 1-€-Lockvogelangeboten.
3. `markenfrei_generate_ideas`: Generiert Kunstwörter & Portmanteaus aus Open-Data Wortfeldern (OpenThesaurus & Datamuse).
4. `markenfrei_inspect_bundle`: Prüft Reverse-DNS App-Bundle-IDs (`de.app.name`) auf iOS App Store & Android Play Store.
5. `markenfrei_list_open_apis`: Liefert das Inventar aller Quellen mit Angabe, ob sie abgefragt oder nur verlinkt werden.

Zusätzlich steht ein nativer HTTP JSON-RPC Endpunkt unter `POST /api/mcp` zur Verfügung.

---

## 🚀 Installation & Start

### Lokal ausführen

```bash
# 1. Klonen
git clone https://github.com/darkspike1988/markenfrei.git
cd markenfrei

# 2. Abhängigkeiten installieren
npm install

# 3. Starten
npm run dev
# oder für Produktion:
npm run build && npm run start
```

Im Browser öffnen: **`http://localhost:3000`**

---

### Mit Docker ausführen

```bash
docker compose up -d --build
```

---

### Deployment auf `markenfrei.app`

#### Option A: Vercel (Empfohlen für Next.js)
1. Repository `https://github.com/darkspike1988/markenfrei` bei [Vercel](https://vercel.com) importieren.
2. In den Vercel-Projekteinstellungen unter **Domains** `markenfrei.app` und `www.markenfrei.app` hinzufügen.
3. Bei deinem Domain-Registrar die DNS-Einträge hinterlegen:
   * **A-Record** für `@` auf `76.76.21.21`
   * **CNAME-Record** für `www` auf `cname.vercel-dns.com`

#### Option B: Docker / VPS (Hetzner, Netcup, etc.)
1. Git-Repository auf den Server klonen.
2. `docker compose up -d` starten.
3. Nginx / Caddy als Reverse-Proxy mit automatischem Let's Encrypt SSL vorschalten:
   ```caddy
   markenfrei.app, www.markenfrei.app {
       reverse_proxy 127.0.0.1:3000
   }
   ```

#### Sicherheitsrelevante Umgebungsvariablen

Markenfrei braucht keine API-Keys. Optional:

| Variable | Wirkung |
|---|---|
| `GITHUB_TOKEN` | Höheres Rate-Limit für die GitHub-Abfragen. Ohne Token funktioniert die Prüfung weiterhin. |
| `MARKENFREI_ENABLE_LOCAL_INSPECT=1` | Erlaubt `appPath` in `/api/rea-inspect` (liest lokale `.app`-Pakete und `Info.plist`). In Produktion standardmäßig gesperrt, nur für lokalen Betrieb sinnvoll. |

---

## 🛠️ Tech-Stack

* **Framework:** Next.js 16 (App Router, Turbopack, React 19)
* **Sprache:** TypeScript
* **Styling:** Tailwind CSS (Warm Monochrome, `#fbfbfa` Canvas, `#111111` Ink, 0 Drop Shadows)
* **Icons:** Phosphor Icons (`@phosphor-icons/react`)
* **Protokolle & APIs:** IETF RDAP (RFC 7484), DNS-over-HTTPS (RFC 8484), Apple iTunes Search & Lookup API, Google Play, Wikipedia REST API, DuckDuckGo Instant Answer API, Wikidata API, GitHub REST API, npm, PyPI, Crates.io, Homebrew API, Go Module Proxy.

---

## 📚 EGM (Elephant-Goldfish-Method) Dokumentation

Die Architektur und Schnittstellen sind modular dokumentiert:
* [`src/README.md`](src/README.md) – Gesamtarchitektur & Datenfluss
* [`src/lib/README.md`](src/lib/README.md) – Scoring, Phonetik, DoH, Domain-Pricing & Open APIs
* [`src/app/api/README.md`](src/app/api/README.md) – API-Routen, Invarianten & Endpunkte

---

## ⚖️ Rechtlicher Hinweis
*Markenfrei* dient der technischen und algorithmischen Vorab-Recherche. Es ersetzt keine anwaltliche Markenberatung oder verbindliche Ähnlichkeitsrecherche durch einen Fachanwalt für gewerblichen Rechtsschutz.
