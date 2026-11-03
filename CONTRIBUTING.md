# Beitragen zu MarkenFrei (Contributing Guidelines) 🤝

Vielen Dank für dein Interesse, zu **MarkenFrei** beizutragen! Dieses Projekt ist Open Source (MIT-Lizenz) und lebt von der Community.

## Verhaltenskodex (Code of Conduct)
Wir legen Wert auf einen respektvollen, konstruktiven und inklusiven Umgang.

---

## Entwicklungsumgebung einrichten

1. Repository forken & klonen:
   ```bash
   git clone https://github.com/darkspike1988/markenfrei.git
   cd markenfrei
   ```
2. Abhängigkeiten installieren:
   ```bash
   npm install
   ```
3. Entwicklungsserver starten:
   ```bash
   npm run dev
   ```
4. Im Browser öffnen: `http://localhost:3000`

---

## Architektur-Übersicht

* `src/lib/opendata.ts`: Schnittstellen zu OpenThesaurus.de, Datamuse API und Morphem-Synthesizer.
* `src/lib/phonetics.ts`: Kölner Phonetik, Soundex, phonetische Zwillinge, § 8 MarkenG Freihaltebedürfnis & Nizza-Klassen Mapping.
* `src/lib/scoring.ts`: Kombinierter 0–100 Clearance-Score & dodomains Brandability Breakdown.
* `src/lib/providers.ts`: Multi-Provider LLM Konfiguration (Gemini, Ollama, DeepSeek, OpenAI, Claude etc.).
* `src/app/api/clearance/route.ts`: Parallele Clearance-Pipeline (RDAP, DNS, App Store, Wikidata, npm, PyPI).
* `src/app/api/generate/route.ts`: KI- und Open-Data Namensgenerierungs-Endpoint.

---

## Pull-Request Prozess

1. Erstelle einen Feature-Branch:
   ```bash
   git checkout -b feature/mein-neues-feature
   ```
2. Führe den TypeScript- und Next.js Build-Check aus:
   ```bash
   npm run build
   ```
3. Committe deine Änderungen mit aussagekräftigen Commit-Nachrichten (Conventional Commits):
   ```bash
   git commit -m "feat: füge neuen TLD-Check hinzu"
   ```
4. Erstelle einen Pull Request gegen den `main`-Branch.

---

## Lizenz
Mit deinem Beitrag erklärst du dich damit einverstanden, dass deine Code-Änderungen unter der **MIT-Lizenz** lizenziert werden.
