# MarkenFrei 🛡️✨

**MarkenFrei** ist ein minimalistisches, hochperformantes Open-Source Clearinghouse zur Vorab-Prüfung und Generierung unbedenklicher Namen für **Apps, Websites, SaaS-Tools und Bibliotheken**.

Das Tool prüft Namen und App-Identitäten in Echtzeit gegen **Marken-Kollisionen, phonetische Zwillinge (§ 9 MarkenG), deutsches Freihaltebedürfnis (§ 8 MarkenG), Apple & Google Play Werktitelschutz (§ 5 Abs. 3 MarkenG), autoritative Registries (DENIC, Verisign, Google, Identity Digital), DoH sowie Entwickler-Namensräume (GitHub, npm, PyPI, Crates.io, Homebrew)**.

Inspiriert von wegweisenden GitHub-Projekten wie `facundoolano/app-store-scraper`, `DunlapCoddingPC/pyUSPTO`, `r13i/dodomains`, `faizul666/domain-search-agent` und REA (Reverse Engineering Anything).

---

## ⚡ Kernfunktionen

### 1. Minimalistischer Omnibar & Smart Intent Detection
* **Ein einziges Eingabefeld (Linear/Raycast Ästhetik):**
  * **Einzelname:** Gibt man ein einzelnes Wort ein (z. B. `WachWerk`), startet die Sofort-Einzelprüfung in unter 500 ms.
  * **Projektidee:** Gibt man eine Beschreibung ein (z. B. `Wachbuch und Schichtplaner für Rettungsdienst`), generiert MarkenFrei passende Kunstwörter, Portmanteaus und prüft sie im Batch.
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

### 3. Autoritative Domains & Fail-Safe Invariant
* **Autoritative RDAP-Endpunkte (kein rdap.org-Proxy):**
  * `.de`: Direkt über `https://rdap.denic.de/domain/`
  * `.com` / `.net`: Direkt über Verisign `https://rdap.verisign.com/`
  * `.app` / `.dev`: Direkt über Google Registry `https://pubapi.registry.google/`
  * `.io` / `.ai`: Direkt über Identity Digital `https://rdap.identitydigital.services/`
* **Dual-Layer DNS-over-HTTPS (DoH) Fallback:**
  * Falls ein RDAP-Server 429 oder einen Timeout meldet, verifiziert MarkenFrei die Existenz von NS- und SOA-Einträgen über Google & Cloudflare DoH.
* **Fail-Safe Invariante:**
  * War eine Quelle nicht erreichbar, wird sie als `unknown` und nie als `available` gewertet. Ein grünes Signal gibt es nur bei vollständiger Prüfung.

---

### 4. Entwickler-Ökosystem & Social Namespaces
* **GitHub:** Nutzer-/Org-Handle Verfügbarkeit + Suche nach bekannten Repositories mit Stars.
* **npm:** Node.js Paket-Namensraum (`registry.npmjs.org`).
* **PyPI:** Python Package Index (`pypi.org`).
* **Crates.io:** Rust Cargo Paket-Namensraum (`crates.io/api/v1/crates/`).
* **Homebrew:** macOS/Linux Formula Namensraum (`formulae.brew.sh`).

---

### 5. Multi-Provider LLM & Open-Data Engine
* **Open-Data (100% lokal, kostenlos & keyless):**
  * OpenThesaurus.de API + Datamuse API + Morphem-Synthesizer.
* **Bring Your Own Key (BYOK) - 100% Client-Side:**
  * Google Gemini (mit optionalem Web Search Grounding)
  * Ollama (lokal auf `localhost:11434`, automatische Modellerkennung)
  * DeepSeek, Groq, Mistral, OpenRouter, OpenAI, Claude, xAI.

---

## 🚀 Installation & Start

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

## 🛠️ Tech-Stack

* **Framework:** Next.js 16 (App Router, Turbopack, React 19)
* **Sprache:** TypeScript
* **Styling:** Tailwind CSS (Warm Monochrome, `#fbfbfa` Canvas, `#111111` Ink, 0 Drop Shadows)
* **Icons:** Phosphor Icons (`@phosphor-icons/react`)
* **Protokolle & APIs:** IETF RDAP (RFC 7484), DNS-over-HTTPS (RFC 8484), Apple iTunes Search API, Google Play, Wikidata API, GitHub REST API, npm, PyPI, Crates.io, Homebrew API.

---

## 📚 EGM (Elephant-Goldfish-Method) Dokumentation

Die Architektur und Schnittstellen sind modular dokumentiert:
* [`src/README.md`](src/README.md) – Gesamtarchitektur & Datenfluss
* [`src/lib/README.md`](src/lib/README.md) – Scoring, Phonetik, DoH & REA-Bridge
* [`src/app/api/README.md`](src/app/api/README.md) – API-Routen, Invarianten & Endpunkte

---

## ⚖️ Rechtlicher Hinweis
*MarkenFrei* dient der technischen und algorithmischen Vorab-Recherche. Es ersetzt keine anwaltliche Markenberatung oder verbindliche Ähnlichkeitsrecherche durch einen Fachanwalt für gewerblichen Rechtsschutz.
