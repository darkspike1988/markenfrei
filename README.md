# MarkenFrei 🛡️✨

**MarkenFrei** ist eine moderne Open-Source Fullstack-Webapp zur Generierung und rechtlichen Vorab-Prüfung von Namen für **Apps, SaaS-Tools und Webseiten**. 

Das Tool hilft Gründern und Entwicklern dabei, Namen zu finden, die **nicht durch bestehende Marken, klanggleiche Varianten (§ 9 MarkenG), bestehende App-Store-Titel (§ 5 Abs. 3 MarkenG) oder vergebene Domains belastet sind**.

Kombiniert die Architekturansätze von `r13i/dodomains` (BYOK Multi-Provider & Brandability Heuristik) und `faizul666/domain-search-agent` (RDAP & Clearance Matrix) mit **echten deutschen Open-Data-Quellen**, **Kölner Phonetik** und **Apple App Store Werktitel-Checks**.

---

## 🌟 Hauptfunktionen

### 1. Namensfindung & Linguistik
* **Open-Data Wort-Labor (100% kostenlos & ohne API-Key):**
  * **OpenThesaurus.de API:** Ruft deutsche Synonyme, Assoziationen und Wortstämme live ab. Per Klick landen Wörter direkt in den Keywords.
  * **Datamuse / WordNet API:** Semantische Wortfelder und phonetische Triggermorpheme.
  * **Morphem- & Portmanteau-Synthesizer:** Bildet automatisch aussprechbare Fantasiewörter und Wortkreuzungen mit hohem Kennzeichnungswert (§ 8 MarkenG).
* **Multi-Provider LLM Unterstützung (Bring Your Own Key):**
  * **Google Gemini** (mit optionalem Live Web-Search Grounding zur Erkennung realer Marken)
  * **Ollama** (100% lokal & privat auf deinem Mac, z. B. `llama3.2`, `qwen2.5`, `mistral`)
  * **DeepSeek, Groq, Mistral, OpenRouter, OpenAI, Anthropic Claude, xAI & Custom Endpoints**
  * API-Keys werden ausschließlich lokal in deinem Browser (`localStorage`) gespeichert.

---

### 2. Rechtliche Vorprüfung & Risikobewertung (§ 8, § 9 & § 5 MarkenG)
* **Kölner Phonetik & Soundex:**
  * Berechnet den offiziellen deutschen Klang-Code (Hans Joachim Postel).
  * Erkennt Verwechslungsgefahr durch klanggleiche Schreibweisen (z. B. *Clarna* vs. *Klarna*).
  * Generiert **phonetische Zwillinge** (c/k, v/f, z/s, ai/ei) zur Gegenprüfung.
* **Prüfung auf Freihaltebedürfnis (§ 8 MarkenG):**
  * Erkennt rein beschreibende Gattungsbegriffe (*Planer, Tracker, Tool, App*) und stuft Fantasienamen vs. beschreibende Begriffe ein.
* **Apple App Store Live-Check (DE):**
  * Prüft live über die iTunes API, ob bereits eine gleichnamige oder verwechslungsfähige App im deutschen App Store existiert (**Werktitelschutz nach § 5 Abs. 3 MarkenG**).
* **Wikidata Open-Data Entity Check:**
  * Prüft strukturierte Daten auf bestehende Unternehmen, Marken, Software oder Plattformen.
* **Nizza-Klassen Empfehlung:**
  * Schlägt automatisch passende Waren- und Dienstleistungsklassen vor (z. B. **Klasse 9** für Apps/Software, **Klasse 42** für SaaS/Cloud, **Klasse 35** für Marktplätze, **Klasse 44** für Gesundheit).
* **DPMAregister & TMview 1-Klick Recherche:**
  * Erzeugt den fertigen **Experten-Suchstring für DPMAregister** zum Kopieren.
  * Bietet 1-Klick-Direktlinks zu **DPMAregister**, **EUIPO (TMview)**, **WIPO Global Brand DB**, **USPTO** und **OffeneRegister.de** (Handelsregister).

---

### 3. Technische & Domain-Verfügbarkeit
* **Echtzeit-Domainchecks ohne Drittanbieter-Key:**
  * Prüft `.de`, `.com`, `.app`, `.ai`, `.io` und `.dev` per DNS-over-HTTPS und IETF-RDAP (`rdap.org`).
  * Direkt-Links zu Registraren (INWX, IONOS, Namecheap, Porkbun).
* **Entwickler- & Social-Handles:**
  * GitHub Account/Org Handle Verfügbarkeit.
  * Suche nach bestehenden GitHub Repositories mit Stars.
  * **npm** Registry & **PyPI** Paketnamen Verfügbarkeit.

---

### 4. Scoring-Matrix & Export
* **Kombinierter Clearance-Score (0–100):**
  * Ampelsystem: 🟢 **Grünes Licht** (Hohe Freigabechance) | 🟡 **Prüfenswert** | 🔴 **Erhöhtes Konfliktrisiko**
  * 6-Faktoren Brandability Aufschlüsselung (Länge, Aussprache, Bindestriche, Ziffern, TLD-Tier, Typo-Risiko).
* **Berichts-Export:**
  * 1-Klick Markdown-Export aller geprüften Namen für Team- oder Kundenentscheidungen.

---

## 🚀 Installation & Start

### Voraussetzungen
* Node.js 18+ (oder v20 / v22 / v26)
* npm, pnpm oder bun

### Schnellstart
```bash
# 1. Repository klonen oder in Projektordner wechseln
cd /Users/michaelkatschko/Projects/MarkenFrei

# 2. Abhängigkeiten installieren
npm install

# 3. Entwicklungsserver starten
npm run dev

# 4. Im Browser öffnen:
http://localhost:3000
```

---

## 🛠️ Tech-Stack

* **Framework:** [Next.js](https://nextjs.org/) (App Router, Turbopack, React 19)
* **Sprache:** TypeScript
* **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
* **Icons:** [Lucide React](https://lucide.dev/)
* **Offene Schnittstellen:** OpenThesaurus.de, Datamuse API, RDAP (IETF), Google DNS-over-HTTPS, Apple iTunes Search API, Wikidata API, GitHub Public API, npm & PyPI Registry APIs.

---

## ⚖️ Rechtlicher Hinweis
*MarkenFrei* dient der technischen und algorithmischen Vorab-Recherche und Ideenfindung. Die Prüfung ersetzt keine anwaltliche Markenberatung oder verbindliche Ähnlichkeitsrecherche durch einen Fachanwalt für gewerblichen Rechtsschutz.

---

## 📄 Lizenz
MIT License – Frei zur privaten und kommerziellen Nutzung.
