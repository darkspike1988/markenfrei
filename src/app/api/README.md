# `src/app/api/` · Backend Route Handlers & Gateway-Schicht

Dieses Verzeichnis stellt die serverseitigen HTTP-Endpunkte (Next.js App Router Route Handlers) bereit. Es orchestriert parallele Hintergrund-Recherchen über autoritative RDAP-Registries, Apple iTunes, Wikidata, GitHub, Paketmanager sowie LLM-APIs.

---

## 1. Endpunkt-Übersicht

```mermaid
sequenceDiagram
    autonumber
    actor Client as MarkenFrei Dashboard
    participant API as /api/clearance
    participant RDAP as Autoritative RDAP-Server
    participant AppStore as Apple iTunes API
    participant Wiki as Wikidata API
    participant Dev as GitHub/npm/PyPI APIs
    participant Gemini as Gemini Search Grounding

    Client->>API: POST /api/clearance { name, tlds, description, ... }
    par Parallele Verifikationen via Promise.all
        API->>RDAP: Registry Lookup (.de, .com, .app, .io, .ai)
    and
        API->>AppStore: itunes.apple.com/search (Werktitel § 5 MarkenG)
    and
        API->>Wiki: wikidata.org/w/api.php (Bekannte Marken & Entitäten)
    and
        API->>Dev: Handle & Repo Checks (GitHub, npm, PyPI)
    and
        opt Gemini Key vorhanden
            API->>Gemini: Web-Search Grounding Abfrage
        end
    end
    API->>API: Phonetische Analyse & Matrix-Scoring berechnen
    API-->>Client: ClearanceReport JSON (Status, Domains, MarkenG, Ampel)
```

---

## 2. Endpunkt-Spezifikationen

### A. `POST /api/clearance` (`clearance/route.ts`)
Führt eine vollständige Multi-Vektor-Prüfung für einen konkreten Namen durch.

- **Request Body:**
  ```typescript
  {
    name: string;             // z. B. "wachwerk"
    tagline?: string;
    category?: string;
    description?: string;     // Projektbeschreibung für Nizza-Klassen
    keywords?: string[];      // Kernbegriffe
    tlds?: string[];          // Default: ["de", "com", "app", "ai", "io"]
    provider?: string;
    apiKey?: string;
  }
  ```

- **Parallele Prüf-Module:**
  1. **Domain-Verfügbarkeit (`checkSingleDomain`):**
     - Fragt autoritative RDAP-Server ab:
       - `.de`: `https://rdap.denic.de/domain/{domain}`
       - `.com` / `.net`: `https://rdap.verisign.com/com/v1/domain/{domain}`
       - `.app` / `.dev`: `https://pubapi.registry.google/rdap/domain/{domain}`
       - `.io` / `.ai`: `https://rdap.identitydigital.services/rdap/domain/{domain}`
     - Status: `200..299` = `taken`, `404` = `available`, sonst `unknown` (mit Retry bei Rate-Limits).
     - Erzeugt Direktlinks zu INWX, IONOS, Namecheap und Porkbun.
  2. **Apple App Store Werktitelschutz (`checkAppleAppStore`):**
     - Fragt die deutsche iTunes-Schnittstelle ab (`https://itunes.apple.com/search?term={name}&country=de&entity=software&limit=5`).
     - Extrahiert den App-Haupttitel vor Doppelpunkt oder Bindestrich.
     - Vergleicht exakt und über Kölner Phonetik.
     - Status: `"clear"` | `"similar"` | `"collision"` (§ 5 Abs. 3 MarkenG).
  3. **Wikidata Entitäten (`checkWikidata`):**
     - Fragt `https://www.wikidata.org/w/api.php?action=wbsearchentities` ab.
     - Filtert nach bestehenden Unternehmen, Marken, Webseiten, Apps oder Software-Projekten.
     - Automatischer Retry bei HTTP 429.
  4. **Entwickler- & Paket-Handles (`checkDevAndSocial`):**
     - Prüft `api.github.com/users/{name}` und sucht Repositories mit hoher Star-Anzahl.
     - Prüft `registry.npmjs.org/{name}` und `pypi.org/pypi/{name}/json`.
  5. **KI-Marken-Grounding (`checkGeminiGroundedTrademark`):**
     - Optional bei Google Gemini: Nutzt `google_search` Tool-Grounding zur Erkennung real existierender, noch nicht im DPMA eingetragener Brands.

- **Response:** `ClearanceReport`

---

### B. `POST /api/generate` (`generate/route.ts`)
Generiert markenrechtlich starke Namenskandidaten über Open-Data oder Bring-Your-Own-Key LLMs.

- **Request Body:**
  ```typescript
  {
    provider?: "opendata" | "google" | "anthropic" | "openai" | ...;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    brandSeed?: string;
    description?: string;
    keywords?: string | string[];
    tone?: string;
    styles?: string[];        // "brandable", "portmanteau", "neolatin", "compound", "short"
    avoid?: string;           // Zu vermeidende Begriffe
    maxLen?: number;          // Default: 11
    count?: number;           // Default: 12
    exclude?: string[];       // Bereits vorhandene Namen ausschließen
  }
  ```

---

### C. `POST /api/opendata-words` (`opendata-words/route.ts`)
Leichtgewichtiger Endpoint für das interaktive Open-Data Wortlabor in der Benutzeroberfläche.
- Nimmt `keywords`, `description`, `brandSeed`, `maxLen` und `avoid` entgegen.
- Gibt das strukturierte `OpenDataWordField` mit Live-Synonymen und Kunstwörtern zurück.

---

### D. `GET /api/ollama-models` (`ollama-models/route.ts`)
Prüft die Verfügbarkeit eines lokalen Ollama-Servers auf dem Rechner des Nutzers (`http://localhost:11434/api/tags`, 1500ms Timeout).
- Rückgabe: `{ running: boolean, models: string[] }`.
