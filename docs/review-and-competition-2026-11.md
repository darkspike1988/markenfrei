# Markenfrei: Synthese aus Reviews, Konkurrenzanalyse und Quellenprüfung

> **Historisch, Stand vor v2.** Dieses Dokument beschreibt den Zustand vom 4. November 2026 (Score /100, Go-Proxy,
> nicht startbares `npx`, Phonetik-Fehler). Die dort genannten Befunde H1 bis H7 sind in v2 behoben; maßgeblich sind
> [v2-spec.md](v2-spec.md) und die [ROADMAP](../ROADMAP.md). Die Konkurrenzanalyse (Abschnitt 1 und 2) bleibt als Hintergrund gültig.

Stand der Eingaben: 04.11.2026. Alle Aussagen stammen aus den gelieferten Reviews und Recherchen. Unsicheres ist mit **(nicht geprüft)** oder **(unsicher)** markiert.

---

## 1. Kurzfazit

**Der Markt hat drei Lager (checkers).**
- **Domain-Suchen, die über Registrare Geld verdienen:** Instant Domain Search (IDS), Domainr/Fastly, Lean Domain Search.
- **Handle-Checker, finanziert über Werbung oder Referral-Links:** Namechk, NameCheckup, KnowEm.
- **KI-Namensgeneratoren als Kundenfang:** Namelix, Shopify.

**Die Markenrecherche ist zweigeteilt (trademark).**
- Die amtlichen Register (DPMAregister, TMview, eSearch plus, WIPO GBD) sind kostenlos, aber nur manuell nutzbar. DPMAregister hat laut DPMA keine Ähnlichkeitssuche.
- Daneben gibt es Kanzlei-Lockangebote (markenchk.de, TMDB, Metzler Legal) und KI-Freemium-Dienste mit Tageslimits, Konten oder OpenAI-Anbindung (TMPilot, markencheck.ai).

**Wo Markenfrei sich abhebt.** Kein geprüfter Dienst und kein gefundener MCP-Server kombiniert alle diese Punkte:
- Domains, App Stores (iTunes, Google Play) und mehrere Paket-Registries in einem Aufruf
- deutsche Quellen wie DENIC, de.wikipedia und die Kölner Phonetik
- einen MCP-Server ohne Schlüssel

Belege: checkers.gaps, mcpcomp.gaps. Einschränkung: Das gilt nur für die durchsuchten Quellen. Dass es nirgends so etwas gibt, ist nicht belegt.

**Stärkster direkter Konkurrent ist IDS.** IDS hat über 800 Endungen (eigene Angabe), zeigt Ergebnisse schon beim Tippen, bietet eine kostenlose US-Markensuche und einen kostenlosen MCP-Server mit 5 Tools. IDS prüft aber keine App Stores, keine Paket-Registries und nur US-Marken.

**Warnsignal aus dem Markt.** Brandomica hatte fast genau den Umfang, den Markenfrei anstrebt, und wurde am 20.04.2026 eingestellt. Belegt ist das durch die Beschreibung des npm-Pakets `brandomica-mcp-server` 9.0.0. Die Gründe sind nicht geprüft.

**Hauptproblem: Markenfrei liefert heute keine verlässlichen Urteile.** Die Reviews belegen mehrere systematische Fehlurteile:

| Problem | Beleg |
|---|---|
| Grüne Ampel, obwohl alle Domains vergeben sind | 81,4 Punkte in der Offline-Probe |
| „Marke" steht standardmäßig auf grün | – |
| Go meldet immer „frei" | – |
| Homebrew-Casks fehlen | – |
| Phonetik-Fehler erzeugen falsche rote Ampeln | – |
| MCP-Text meldet „Status: clear", obwohl Quellen ausgefallen sind | – |

Hinzu kommt: Kein beworbener Startweg für den MCP-Server funktioniert (npx liefert 404, bin hängt vom Arbeitsverzeichnis ab, Remote scheitert am TLS-Zertifikat). Die Testsuite ist grün (55/55), deckt diese Logik aber nicht ab (arch).

**Folgerung.** Markenfrei hat die breiteste Abdeckung und die einzige DE/EU-Ausrichtung. Gewinnen kann es aber nur über Ehrlichkeit und Verlässlichkeit, nicht über Breite oder Tempo. Bei Domain-Tempo und Domain-Breite ist IDS mit seinem Zonendatei-Index strukturell überlegen.

---

## 2. Kern-Use-Case

### Für Menschen

**Wer:** Entwickler, Indie-Gründer und kleine Teams im DACH-Raum, die ein Software-Produkt benennen (App, Web-Dienst, Paket, CLI).

**Wann:** In den Minuten, bevor sie sich festlegen, also vor dem `npm init`, dem App-Store-Eintrag, dem Domain-Kauf oder dem Anlegen des Repos.

**Frage:** „Kann ich diesen einen Namen überall gleichzeitig nutzen? Und wo muss ich für Marken selbst nachsehen?"

**Ergebnis:**
1. **Eine Zeile pro Namensraum.** Jede Zeile hat einen von drei Zuständen (vergeben, nicht gefunden, unbekannt), die Quelle und den Prüfzeitpunkt. Dazu kommt eine Ampel ohne Geschmackskriterien.
2. **Marke ausdrücklich als „nicht geprüft".** Stattdessen gibt es eine fertige Vorbereitung für die manuelle Recherche:
   - funktionierende, vorausgefüllte Links zu DPMA, TMview und WIPO
   - einen gültigen DPMA-Expertensuchstring
   - Schreibvarianten und Phonetik-Zwillinge
   - einen Klassenvorschlag
3. **Ein teilbarer Link** mit den gewählten Endungen und dem Prüfdatum.

**Warum Markenfrei hier besser sein kann:**
- **IDS:** keine App Stores, keine Pakete, Marken nur USA, Verfügbarkeit aus einem täglichen Index (checkers).
- **toddcooke/namechecker:** die breiteste Registry-Abdeckung, aber keine Domains und keine App Stores. Das TODO zu Schreibvarianten ist dort ungelöst.
- **NameCheckup und Namechk:** nur Social-Handles und Domains, laut eigener Angabe bzw. Websuche nur heuristisch.
- **DPMAregister und TMview:** nur manuell nutzbar. DPMA hat keine Ähnlichkeitssuche. TMview prüft laut Sekundärquelle nur die Schreibweise.
- **TMPilot und markencheck.ai:** Tageslimits, KI-Scores ohne nachvollziehbare Herleitung, OpenAI als Sub-Prozessor.
- **Kanzlei-Portale:** Ziel ist der Lead für die Kanzlei.

Die Lücke in einem Satz: deterministisch, ohne Konto, ohne LLM, ohne Affiliate, mit DE/EU-Vorbereitung.

### Für Agenten über MCP

**Wer:** Coding-Agenten in Claude Code, Cursor oder ähnlichen Clients.

**Wann:**
- Ein Nutzer sagt „leg ein neues Paket bzw. Projekt namens X an".
- Ein Agent soll für ein Projekt Namen vorschlagen.

**Ablauf:**
1. Der Agent prüft vor dem Scaffold mit `check_name` gezielt die Namensräume, die er braucht, etwa npm, PyPI und .dev.
2. Bei einer Shortlist ruft er `check_names` auf.
3. Fürs Benennen erzeugt das LLM des Clients die Kandidaten. Markenfrei prüft sie nur deterministisch. Das ist das Zwei-Phasen-Muster von dorukardahan `name_project` und passt zum Grundsatz „kein LLM im Produkt".

**Begründung mit den Lücken der Konkurrenz (mcpcomp):**
- Kein gefundener MCP-Server prüft Domains, App Stores und PyPI, crates.io und Homebrew in einem Aufruf. dorukardahan prüft nur Domains, Socials und npm. NameSniper prüft nur Domains und Handles.
- Kein gefundener Server fragt DPMA ab oder nutzt deutsche Phonetik.
- Die Marken-MCPs sind gehostet und geschlossen (Antevo, Goalie IP, IDS) oder brauchen für die EU einen Schlüssel (foreverworks).
- Markenfrei steht nicht in der offiziellen MCP-Registry (`search=markenfrei`: count 0).

---

## 3. Top-Befunde aus den Reviews (dedupliziert, nach Schwere)

### Hoch

**H1. Die Ampel ist unehrlich und intern widersprüchlich** (ux, arch)
- **Marke standardmäßig grün:** „Marke" startet mit `ok` = „unauffällig" (verdict.ts:65), obwohl kein Register abgefragt wird.
- **Grün trotz vergebener Domains:** Die Gesamtampel kann grün sein, obwohl alle Domains und Handles vergeben sind. Die Offline-Probe ergab 81,4 Punkte, Verdikt „grün", Bereich Domain = `bad`. Ursache: Rund 57 % des Gewichts (51 von 90) sind Geschmackskriterien (scoring.ts:44-53, 281-302).
- **Drei getrennte Logiken:** Score, Bereichsampel und `incomplete` werten dieselben Daten unterschiedlich aus. Dadurch kann eine rote Gesamtampel ohne roten Bereich erscheinen.
- **Irreführende Labels:** „Wahrscheinlich frei" verspricht zu viel. Eine Legende fehlt. Das Server-Label „Unvollständig geprüft" wird in der Oberfläche nie angezeigt.

**H2. Systematisch falsches „frei"** (arch, mcp, Quellenprüfung)
- **Go:** `proxy.golang.org/<name>/@v/list` liefert für bloße Namen immer 404 („missing dot in first path element"), auch für `react`. Markenfrei wertet das als „available".
- **Homebrew:** Geprüft wird nur `/api/formula/`. Für `raycast` liefert das 404, `/api/cask/raycast.json` dagegen 200.
- **npm und GitHub:** 404 wird als „frei" gewertet. npm kann aber ähnliche Namen trotzdem ablehnen (E403, Websuche, keine offizielle Definition). Die GitHub-Grenze von 39 Zeichen ist nicht live geprüft.
- **GitHub ohne Token:** Das Kontingent (Suche 10/min, core 60/h, gemessen) ist schnell erschöpft. Danach wird GitHub zu `unknown`, und die Paket-Ampel bleibt trotzdem grün.
- **Unsichtbare Ausfälle:** Fallen Wikipedia oder DuckDuckGo aus, erscheinen sie nicht in `incomplete`.

**H3. Falsches „rot"** (arch)
- **Fehler in der Kölner Phonetik:** Bei leerem `next`/`prev` greift `"csz".includes("")` und liefert true. Beispiele: `brot` → 178 statt 172, `xaver` → 837 statt 4837.
- **Zu grobe Regeln für Klang und Teilwörter:** tiger→docker, lunar→linear und nation→notion gelten als „klangidentisch". deeplink→deepl und metallbau→meta gelten als „enthalten". Beides führt direkt zu Rot.
- **Mehrfache Strafe für Allerweltswörter:** Wikidata, Wikipedia und DuckDuckGo bestrafen dieselbe Tatsache bis zu dreimal. Die Regex für Teilwörter trifft auch „Briefmarke" und „Gottesdienst".

**H4. Der MCP-Text erweckt bei Ausfällen den Eindruck „frei"** (mcp)
- Offline-Test: `incomplete` enthielt 5 Quellen. Der Text meldete trotzdem „Status: clear", „Keine … Apps gefunden" und GELB mit dem Label „Einzelne Treffer beachten", obwohl es gar keine Treffer gab (server.ts:69-111, clearance.ts:623-628).

**H5. Keiner der beworbenen MCP-Startwege funktioniert** (mcp, ux)
- **npx:** `npx -y markenfrei-mcp` liefert auf npm 404. Das Paket ist `private` und heißt `markenfrei`. tsx steht nur in den devDependencies.
- **bin-Starter:** `bin/markenfrei-mcp.mjs` scheitert, wenn das Arbeitsverzeichnis nicht das Repo ist (`ERR_MODULE_NOT_FOUND tsx`). Bei einem Signal-Abbruch endet er mit Exit-Code 0.
- **Remote:** `https://markenfrei.app/api/mcp` scheitert am TLS-Zertifikat. Ob die Route dort überhaupt deployt ist, ist nicht geprüft.
- **Info-Dialog:** Die Konfigurationen für Claude und Cursor sind identisch und falsch. Der Dialog nennt 4 Tools, registriert sind 5. Das GitHub-Repo liefert 404.

**H6. Der MCP-HTTP-Endpunkt verstärkt Last auf Dritte** (arch, mcp)
- **Batch umgeht das Rate-Limit:** Ein JSON-RPC-Batch zählt nur als eine Anfrage. 5 Aufrufe ergaben 110 ausgehende Fetches. Erlaubt sind bis zu 100 Aufrufe pro Anfrage (`MAX_BATCH_SIZE`).
- **Fälschbare IP:** `x-forwarded-for` lässt sich fälschen.
- **Origin-Header:** Er wird nicht geprüft, obwohl die Spezifikation das mit MUST verlangt.
- **Body-Größe:** Sie ist nicht begrenzt.

**H7. Die Domain-Eingabe prüft den falschen Namen** (ux)
- Gibt jemand `wachwerk.de` ein, landet das im Bundle-ID-Modus und es wird der Name `de` geprüft (page.tsx:80-82, 190-208).

### Mittel

- **Veraltete SDK-API:** `server.tool` und `server.prompt` sind deprecated, es fehlen `outputSchema`, `annotations` und `title` (mcp, mcpcomp).
- **Zu große und doppelte Antworten:** `clearance_check` liefert offline rund 7,2 KB als Markdown, JSON-Text und `structuredContent`. `list_open_apis` liefert rund 26 KB (mcp).
- **Lockere Eingabeschemas:** `count:-1` wird angenommen, `tlds` hat kein enum und kein max, eine unbekannte `category` ergibt still `[]` (mcp).
- **Irreführende Beschreibungen:** „unbedenkliche Markennamen", „offizielle Register", ein Prompt verlangt eine Einstufung nach § 9 MarkenG, ein Open-API-Eintrag sagt „Zero-Key" bei bloßem Deep-Link (mcp, mcpcomp).
- **Fehlende schlanke Tools:** Für den Paketnamen-Fall gibt es kein schmales Tool. Jeder Aufruf startet 22 bis 41 Anfragen bei 5 Endungen und 25 bis 53 bei 8 (arch, mcp).
- **Keine Obergrenzen:** Es gibt weder ein Gesamt-Deadline noch ein Semaphor pro Host noch das Bündeln gleichzeitiger gleicher Anfragen (arch).
- **Fehlerhafte Register-Links** (trademark, im Formular nicht getestet):
  - Der DPMA-Expertenstring nutzt `IC=`, `AND/OR` und `*`. Laut DPMA-Expertenseite heißen sie `KL`, `UND/ODER/NICHT` und `? ! #`.
  - Der DPMA-Link füllt nichts vor.
  - Der EUIPO-Link nutzt eine Detailroute statt einer Namenssuche.
  - Der OffeneRegister-Link nutzt einen undokumentierten Parameter `?q=`, und die Daten sind veraltet.
- **Überladene Oberfläche** (ux):
  - Drei Modi teilen sich ein Feld, ein Leerzeichen schaltet still zum Generator um.
  - Detailansicht und Info-Dialog sind überladen (Registrar-Preise, Phonetik-Codes, API-Inventar).
  - Die Zufallsbeispiele erzeugen Live-Last bei rund 20 Diensten.
- **Fehlerzustände ohne Ausweg:** Im Batch fallen Kandidaten still weg (ux).
- **Barrierefreiheit:** kein Label am Eingabefeld, Dialoge ohne Fokusführung, ein `button` mit `ul` darin, Kontrast der Farbe `muted` 4,32:1 bzw. 4,14:1, also unter AA (ux).

### Niedrig

- **Zu kleines Paket:** Ladezähler, Teilen-Link ohne Endungen, `.de`-Filter fest verdrahtet, mobile Darstellung nicht visuell geprüft (ux).
- **Unklare Versprechen:** Die README verspricht mehr, als die App kann. Web und MCP haben verschiedene Standard-Endungen (ux).
- **Respekt gegenüber Registries:** Antwort-Bodies werden nicht gelesen oder abgebrochen. npm lädt für `react` 7,1 MB (arch).
- **Fehlerbehandlung:** Eingabefehler in den Routen ergeben 500 samt interner Meldungen (arch).
- **Testlücken:** Es fehlen Referenzwerte für die Phonetik, Invarianten-Tests, ein MCP-Batch-Test und ein stdio-Test mit fremdem Arbeitsverzeichnis (arch, mcp).
- **Kleinigkeiten:** `method` ist immer `rdap`, iTunes wird mit `limit=5` abgefragt, keine Server-instructions, Version 1.0.0 statt 0.1.0, unbenutztes `lucide-react` (arch, mcp, ux).

---

## 4. Bestätigte neue Quellen (usable = true)

### Für alle Quellen gilt

- **Status:** 429, 5xx, Timeouts und Antworten in unerwartetem Format sind „unbekannt", nie „frei".
- **Ergebnis „nicht gefunden":** Es heißt nicht „registrierbar". Gründe dafür sind reservierte oder gesperrte Namen, Ähnlichkeitsregeln und private Namensräume.
- **Abfrageverhalten:** nur Einzelabfragen, die ein Nutzer auslöst, mit Cache und Backoff, ohne Massenabfragen.

### Paket-Registries

| Quelle | Endpunkt | Vergeben | Nicht gefunden | Hinweis |
|---|---|---|---|---|
| NuGet | `api.nuget.org/v3-flatcontainer/{name_lower}/index.json` | 200 mit `versions` | 404 | Basis-URL laut Doku aus dem Service-Index laden. ID vorher kleinschreiben. Prefix-Reservierungen (`Microsoft.*`) erkennt das nicht. |
| RubyGems | `rubygems.org/api/v1/gems/{name}.json` | 200 | 404 | 10 Anfragen/s pro IP. CDN cacht 404 einige Minuten. |
| Maven Central | `search.maven.org/solrsearch/select?q=a:{name}&rows=1&wt=json` | `numFound > 0` | `numFound = 0` | Status ist immer 200. artifactId ist nicht global eindeutig, daher nur als „vorhanden/ähnlich" werten. `g:{name}` ist irreführend, nicht verwenden. |
| Packagist (Vendor) | `packagist.org/packages/list.json?vendor={name}` | `packageNames` nicht leer | `[]` | User-Agent mit `mailto=` ist Pflicht, sonst droht eine IP-Sperre. Höchstens 10 gleichzeitige Anfragen. |
| pub.dev | `pub.dev/api/packages/{name}/score` | 200 | 404 | Höchstens 120 s cachen (Google API Terms). Nur nach Statuscode entscheiden. |
| Homebrew Cask | `formulae.brew.sh/api/cask/{name}.json` | 200 | 404 | Zusammen mit Formula prüfen. Tokens werden kleingeschrieben und mit Bindestrichen verbunden. |
| JSR (Scope) | `api.jsr.io/scopes/{name}` | 200 | 404 `scopeNotFound` | 400 bei ungültigem Namen. User-Agent im Format `name/version; url`. Freigabe eher weich (Doku nennt help@jsr.io). |
| Hex.pm | `hex.pm/api/packages/{name}` | 200 | 404 | 100 Anfragen/min ohne Anmeldung. User-Agent mit Version ist Pflicht, sonst 400. |
| CRAN (crandb, R-hub) | `crandb.r-pkg.org/{name}` | 200 | 404 `not_found` | Spiegel eines Drittanbieters mit bis zu 30 min Cache. CRAN verbietet Namen, die sich nur in der Groß-/Kleinschreibung unterscheiden, das fragt diese Prüfung nicht ab. |

### Erweiterungen und Stores

| Quelle | Endpunkt | Vergeben | Nicht gefunden | Hinweis |
|---|---|---|---|---|
| Open VSX (Namespace) | `open-vsx.org/api/{name}` | 200 | 404 | Der Namespace ist eine Publisher-ID, kein Erweiterungsname. Volltextsuche nur als Hinweis. Crawl-delay 2 s. Ersetzt den VS Code Marketplace. |
| Firefox Add-ons | `addons.mozilla.org/api/v5/addons/search/?q={name}&page_size=5&lang=de` | exakter Treffer in `results[].name` | `count = 0` | Die Suche ist unscharf, `count > 0` reicht nicht. `name` ist ein Objekt mit mehreren Sprachen. |
| F-Droid | `search.f-droid.org/api/search_apps?q={name}` | exakter Treffer in `apps[].name` | kein exakter Treffer bzw. `[]` | Unscharf, durchsucht auch die Zusammenfassung. Nur das offizielle Repo. |

### Domains

| Quelle | Endpunkt | Vergeben | Nicht gefunden | Hinweis |
|---|---|---|---|---|
| IANA-RDAP-Bootstrap | `data.iana.org/rdap/dns.json`, dann `{basis}domain/{name}.{tld}` | 200 | 404 vom autoritativen Server | Grundlage ist RFC 9224, nicht 7484. Cache 24 h (`max-age=86400`). Nur der Statuscode zählt, denn SIDN liefert `ldhName` auch bei 404. Bei Ausfall die weiteren Basis-URLs nutzen. Im Bootstrap fehlen u. a. de, io, ch, li, at, eu und co. Der Kommentar in clearance.ts:111-115 ist damit falsch. |
| SWITCH (.ch, .li) | `rdap.nic.ch/domain/{name}.ch` bzw. `.li` | 200 | 404 mit leerem Body | Fester Override nötig. Die AUP (Ziffer 2) erlaubt ausdrücklich die Prüfung, ob ein Name registriert ist. Kommerzielle Zwecke sind ausgeschlossen. HEAD genügt. |

### Social- und Entwickler-Handles

| Quelle | Endpunkt | Vergeben | Nicht gefunden | Hinweis |
|---|---|---|---|---|
| Bluesky | `public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle={name}.bsky.social` | 200 mit `did` | 400 mit „Unable to resolve handle" | Auf genau diese Meldung prüfen. Marken nutzen oft Domain-Handles, daher `{name}.com` zusätzlich prüfen. |
| Mastodon (mastodon.social) | `mastodon.social/.well-known/webfinger?resource=acct:{name}@mastodon.social` | 200 | 404 | Nur WebFinger verwenden. `accounts/lookup` braucht laut Doku einen User-Token. Gilt nur für diese eine Instanz. 300 Anfragen pro 5 min und IP. |
| Hacker News (User) | `hacker-news.firebaseio.com/v0/user/{name}.json` | Objekt mit `id` | `null` (Status 200) | Nutzer ohne Beiträge liefern ebenfalls `null`. Groß-/Kleinschreibung zählt. Antworten bis rund 114 KB. |
| GitLab.com | `gitlab.com/api/v4/users?username={name}` und `.../groups/{name}?with_projects=false` | Nutzer-Array nicht leer oder Gruppe 200 | `[]` und 404 | **Widersprüchlich bewertet**, siehe unten. |

### Firmen und bekannte Namen

| Quelle | Endpunkt | Vergeben | Nicht gefunden | Hinweis |
|---|---|---|---|---|
| GLEIF LEI | `api.gleif.org/api/v1/lei-records?filter[entity.legalName]={name}&page[size]=5` | `total > 0` | `total = 0` | Daten unter CC0. Der Filter matcht auf Teilwörter, daher selbst exakt oder phonetisch vergleichen. Nur `entity.status=ACTIVE` zählt. Enthält nur Rechtsträger mit LEI. Rate-Limit offiziell nicht belegt. |
| Wikidata SPARQL | `query.wikidata.org/sparql` mit exaktem Label plus P31-Typ | `bindings` nicht leer | `[]` | Liefert den echten Typ statt einer Regex (clearance.ts:206-209). Besser mit `P31/P279*` und `VALUES` auf Unternehmen, Marke und Software filtern. Groß-/Kleinschreibung zählt. Der User-Agent braucht laut Policy Kontakt und „bot". Timeout rund 5 s. |
| HN Search (Algolia) | `hn.algolia.com/api/v1/search?query=%22{name}%22&tags=show_hn&hitsPerPage=20` | Titel passt auf `^Show HN:\s*{name}\b` | `nbHits = 0` | Schwaches Signal. Bloße Erwähnungen wie „alternative to Dropbox" zählen nicht. Limit 10.000/h, offiziell dokumentiert. |

### Widersprüche in den Eingaben

- **GitLab:** Eine Prüfung bewertet die Quelle mit zwei Abfragen als nutzbar und liest robots.txt als reine Crawler-Regel. Die andere verwirft sie: robots.txt enthält `Disallow: /api/v*`, und ein Limit von 60/h ist angekündigt. Mit einer Abfrage wäre „frei" nachweislich falsch, weil `gitlab-org` dann als frei gilt. **Empfehlung:** nicht standardmäßig einbauen, sondern als Deep-Link oder höchstens Opt-in.
- **F-Droid:** Bei der Recherche abgelehnt wurde nur die Paket-ID-API. Die Volltextsuche ist bestätigt nutzbar.

### Verworfen (je ein Satz)

**Verworfen:**
- **Docker Hub:** `/v2/users/{name}` ist undokumentiert, und die ToS erlauben Automatisierung nur über dokumentierte APIs. Der dokumentierte Pfad `/v2/namespaces/library/repositories/{name}` gilt nur für offizielle Images und ist im Fall „frei" ungetestet.
- **conda-forge:** Die ToS verbieten die Nutzung im Auftrag Dritter.
- **Snapcraft:** robots.txt enthält `Disallow: /`, und die ToS (§ 5.8) sind mehrdeutig.
- **Codeberg:** robots.txt enthält `Disallow: /api/`, eine Erlaubnis gibt es nicht.
- **SEC EDGAR:** 403, weil der User-Agent keine Kontakt-E-Mail enthält.
- **Open Food Facts:** 503 und anonym gesperrt.
- **.CO RDAP:** Die ToS verbieten Speichern und Automatisierung.
- **GitLab mit einer Abfrage:** liefert falsches „frei".
- **Steam:** Das Subscriber Agreement verbietet Automatisierung „in any manner".
- **Microsoft Store:** Endpunkt ohne Doku, Scraping-Klausel im Services Agreement.

**Bei der Recherche abgelehnt:**
- **Nur per POST abfragbar:** VS Code Marketplace und Flathub-Suche.
- **robots.txt sperrt die Suche:** Chrome Web Store.
- **Keine Zukunft für neue Namen:** CocoaPods wird am 02.12.2026 read-only.
- **Daten veraltet:** OffeneRegister (502, Dump von 2019).
- **Schlüssel nötig:** OpenCorporates und Companies House.
- **Nutzungsbedingungen bzw. Limits:** Handelsregister.de (§ 9 HGB, rund 60/h).
- **Nur als Deep-Link denkbar:** Reddit (403), Instagram, TikTok, X und YouTube.
- **Gefährlich:** `rdap.org` liefert für vergebene .de-, .ch- und .eu-Domains 404 und damit falsches „frei".
- **Weitere:** SourceHut, Bioconductor, CRAN direkt, Product Hunt, Unternehmensregister, Bundesanzeiger, data.europa.eu, Amazon Appstore, .at/.eu-RDAP (existiert nicht) und WHOIS über Port 43.

---

## 5. Konkrete Produktänderungen

### Weg (Minimalismus)

**Aus der Oberfläche:**
- Bundle-ID-Modus aus der Web-Oberfläche.
- Generator im Hauptfeld. Höchstens ein sekundärer Link „Keine Idee?" mit eigenem Feld. Für Agenten übernimmt das Zwei-Phasen-Tool.
- Der Wert /100 und die Geschmackskriterien in der Ampel.
- Zufallsbeispiele. Stattdessen drei feste Beispiele oder eine statische Beispielzeile.
- Registrar-Preisvergleich, Phonetik-Codes, Methodik-Block, Flaggen, Emoji-Tabs und API-Inventar. Das Inventar kommt in die README oder auf eine eigene Seite.
- Doppelte Gebührenblöcke.
- Der fest verdrahtete Filter „Nur freie .de".

**Aus den Quellen und Daten:**
- Go-Prüfung, oder nur noch `github.com/{name}` mit eindeutiger Beschriftung.
- OffeneRegister-Link, oder nur mit Warnung vor dem alten Datenstand.

**Aus dem MCP-Server:**
- `markenfrei_list_open_apis` in der jetzigen Form.
- `generate_ideas` mit dem Wort „unbedenklich".
- Doppeltes Markdown plus JSON-Text in den Antworten.

**Aus dem Repo:**
- `lucide-react` und die Vorlagen-SVGs.
- Superlative in der README.

### Neu

- **Vierter Zustand:** grau „nicht geprüft". „Marke" zeigt immer „Register nicht geprüft" und verlinkt auf die Recherche-Vorbereitung.
- **Recherche-Vorbereitung für Marken:**
  - korrigierte und einmal im Browser getestete Links zu DPMA, TMview und WIPO GBD, jeweils mit Prüfdatum
  - ein gültiger DPMA-Expertenstring (`KL`, `UND/ODER`, `? ! #`) mit Kopier-Knopf
  - Schreibvarianten (Bindestrich und Zusammenschreibung, ä/ae, ph/f, c/k/z, Phonetik-Zwillinge), jede mit Links
  - eine Checkliste nach DPMA-Empfehlung
  - Klassenvorschlag nach Regeln
- **Neue Quellen** aus Abschnitt 4, gruppiert nach Ökosystem und standardmäßig nur auf Auswahl („Mein Ökosystem: npm, PyPI, …"), um den Fan-out klein zu halten.
- **Deep-Links zur manuellen Prüfung:** Instagram, TikTok, X, YouTube, Chrome Web Store, Microsoft Store, handelsregister.de (mit Kopierhilfe) und Codeberg.
- **Shortlist-Prüfung** für bis zu 10 Namen in Web und MCP, mit Rangliste „frei in allen gewählten Namensräumen".
- **Ergebnisliste je Quelle:** Quelle, Status, Link zum Nachprüfen, Zeitpunkt, „Erneut prüfen".
- **Teilen-Link** mit `?q=…&tld=…`, „Geprüft am …" und optional ein OG-Bild.
- **Dark Mode, Datenschutz-Hinweis** („keine Suchanfragen gespeichert; RDAP-Abfragen erreichen die Registries") und eine Kopieranleitung für den MCP-Server.

### Besser

**Urteilslogik:**
- **Eine Quelle der Wahrheit:** zuerst die Bereichsstatus berechnen. Daraus folgt die Ampel:
  - rot, sobald ein Bereich `bad` ist
  - grün nur, wenn alle Bereiche `ok` sind und `incomplete` leer ist
  - sonst gelb
- **Labels:** „Keine Treffer gefunden" / „Treffer oder Lücken" / „Konflikt", bei Lücken „Unvollständig".

**Datenquellen:**
- **Phonetik:** Randfälle korrigieren und Referenztests ergänzen. Die Referenzwerte stammen aus dem Review und sind noch zu verifizieren. Klanggleichheit nur ab 4 Stellen und zusammen mit Levenshtein ≤ 2. „Enthalten" nur ab rund 5 Zeichen, an der Wortgrenze und dann als Prüfhinweis, nicht als Rot.
- **Wikipedia und DuckDuckGo:** nur als Hinweis ohne Abzug. Wikidata über SPARQL mit Typfilter. Jeder Ausfall kommt einzeln in `incomplete`.
- **Homebrew:** Formula und Cask gemeinsam prüfen.
- **npm:** „nicht belegt (Ähnlichkeitsregel möglich)". Vorher eine Syntaxprüfung pro Plattform; ungültige Namen gelten als „nicht möglich".
- **RDAP:**
  - Bootstrap dynamisch laden, plus Overrides für de, io, ch und li.
  - .co, .at und .eu nur per DoH, und dort nur „vergeben" oder „unklar".

**Last und Robustheit:**
- **Limits für die Last:** Gesamt-Deadline von rund 8 s, Semaphor pro Host, gleichzeitige gleiche Anfragen bündeln, Cache pro Quelle.
- **Schonender Abruf:** HEAD oder `body.cancel()`, für npm `Accept: application/vnd.npm.install-v1+json`.
- **GitHub:** `x-ratelimit-reset` beachten und bis dahin nicht erneut anfragen.
- **Routen:** Eingaben mit zod validieren, bei Fehlern 400, bei 500 nur eine generische Meldung.

**Oberfläche und Konsistenz:**
- **Konsistenz:** gleiche Standard-Endungen in Web und MCP (`DEFAULT_TLDS`), gleiches Schema.
- **Barrierefreiheit:** Label und `form`, natives `dialog` mit `showModal()`, Ergebniszeile als `li`, Status als Text, `muted` mindestens `#6b6a67`, Schrift mindestens 12 px, Tippziele mindestens 24 px.

### MCP-Tool-Design

Das Design folgt mcpcomp und mcp.

**Gemeinsame Regeln für alle Tools:**
- `server.registerTool` mit `title`, zod-`outputSchema` (PublicReport als zod-Schema, Typ per `z.infer`) und `annotations`.
- Kompakter Text von 5 bis 10 Zeilen plus `structuredContent`.
- Server-`instructions`: „grün heißt nicht markenrechtlich frei; `incomplete` beachten; Paketfall: `namespaces:["packages"]`".

| Tool | Eingabe | Ausgabe | Annotations |
|---|---|---|---|
| `markenfrei_check_name` | `name` (string, 2–63), `namespaces?` (enum[] aus `domains`, `packages`, `stores`, `social`, `known_names`; Standard: `domains` und `packages`), `tlds?` (enum aus `SUPPORTED_TLDS`, max. 8), `ecosystems?` (enum aus `npm`, `pypi`, `crates`, `github`, `homebrew`, `nuget`, `rubygems`, `maven`, `packagist`, `pub`, `jsr`, `hex`, `cran`, `openvsx`), `detail?` (`compact` oder `full`) | `{name, normalized, checked_at, verdict: green\|yellow\|red, incomplete[], results[{namespace, source, target, status: taken\|not_found\|unknown\|similar, url, checked_at, note}], trademark: {status: "not_checked", next_step}}` | readOnly, openWorld, idempotent |
| `markenfrei_check_names` | `names` (1–10), sonst wie oben | Rangliste `[{name, verdict, free_in_all_requested, taken[], unknown[]}]` | readOnly, openWorld, idempotent |
| `markenfrei_suggest_available_names` | Phase 1 ohne `candidates`: Regeln (Länge, Freihaltebedürfnis vermeiden, Zeichen). Phase 2 mit `candidates` (max. 10) und `require` (Namensräume) | nur die Kandidaten, die in allen geforderten Namensräumen `not_found` sind, mit Begründung | readOnly, openWorld |
| `markenfrei_register_links` | `name`, `classes?` (int 1–45), `offices?` (enum aus DPMA, EUIPO, TMview, WIPO) | Deep-Links mit Prüfdatum, DPMA-Expertenstring, Varianten, Klassenvorschlag, Checkliste, ohne Netzwerkabfrage | readOnly, closed world |

**Aufräumen:**
- `domain_pricing` und `list_open_apis` werden gestrichen, oder `list_open_apis` liefert standardmäßig nur Kategorien und Anzahl.
- `inspect_bundle` geht entweder im Namensraum `stores` auf oder bleibt als sekundäres Tool (offen, siehe Abschnitt 6).

**Muster für den kompakten Text:**
```
wachwerk: GELB (Unvollständig: GitHub)
Domains: .de vergeben | .com nicht gefunden | .dev unbekannt
Pakete: npm nicht gefunden (Ähnlichkeitsregel möglich) | PyPI nicht gefunden
Marke: nicht geprüft -> markenfrei_register_links
```

**Transport und Verteilung:**
- **HTTP-Transport absichern:**
  - Batches mit mehr als einem Element mit 400 ablehnen.
  - Den Origin-Header prüfen: fehlt er, durchlassen; sonst nur die eigene Domain und localhost.
  - Body höchstens 64 KB.
  - Ein strengeres Limit für `tools/call` und ein globales Semaphor.
- **Verteilung:** eigenes Paket `markenfrei-mcp` als gebündelte `dist/cli.mjs` mit Shebang, ohne tsx zur Laufzeit. Vor dem Veröffentlichen `npm pack` testen, dazu ein Test mit `cwd=os.tmpdir()`.
- **Auffindbarkeit:** TLS für den Remote-Endpunkt einrichten und den Server mit `server.json` in die MCP-Registry eintragen.

---

## 6. Risiken und offene Fragen

**Haftung und Vertrauen**
- Jede grüne oder „freie" Anzeige kann als Markenfreigabe gelesen werden. Vorgesehene Gegenmittel: Zustand „nicht geprüft", Formulierung „nicht gefunden" statt „frei" und kein Prompt, der eine Einschätzung nach § 9 MarkenG verlangt.
- Die Wirkung dieser Maßnahmen ist nicht geprüft.

**Last auf Dritte und gemeinsame Server-IP**
- Jede neue Quelle vergrößert den Fan-out. Die Limits gelten für alle Nutzer zusammen: GitHub 60/h, Hex 100/min, Mastodon 300 pro 5 min, bei GitLab sind 60/h angekündigt.
- Ohne Auswahl pro Ökosystem und Caching drohen Sperren.
- Die Limits der RDAP-Betreiber sind nicht geprüft.

**User-Agent mit Kontakt**
- Packagist (`mailto`), Wikidata (Kontakt und „bot"), JSR (URL) und SEC verlangen Kontaktangaben im User-Agent.
- Der heutige `MARKENFREI_UA` verweist auf ein GitHub-Repo, das 404 liefert, und enthält keine E-Mail.
- **Offen:** Welche echte Kontaktadresse gibt der Betreiber frei?

**Infrastruktur**
- Das TLS-Zertifikat für markenfrei.app fehlt.
- Ob die Route deployt ist, ist nicht geprüft.
- Die Funktionslimits auf Serverless-Plattformen sind nicht geprüft.

**Ungeprüfte Annahmen**
- DPMA-Expertenstring und Linkformate von TMview, EUIPO und WIPO wurden nicht im Formular getestet.
- Die DPMA-Gebühr von 290 € ist nicht geprüft.
- Die TMview-Angabe „über 110 Mio." ist nicht geprüft; ein älterer Artikel nennt 53 Mio.
- Die npm-Ähnlichkeitsregel ist nicht offiziell definiert.
- Die 39-Zeichen-Grenze bei GitHub ist nicht live geprüft.
- Der DoH-Fallback für .at und .eu ist laut ROADMAP.md:29 ungetestet.
- Die App wurde nicht gestartet. Mobile Darstellung und Kontrast im Lauf sind nicht visuell geprüft.

**USPTO-Bulk-Daten**
- IDS zeigt, dass eine kostenlose US-Markensuche aus dem „Trademark Case Files Dataset" möglich ist.
- **Offen:** Braucht der ODP-Download (signierte URLs) ein Konto oder einen Schlüssel? Welche Lizenz gilt? Wie aktuell sind die Daten (laut Seite bis März 2024, tägliche Dateien nicht gelesen)?
- Das wäre ohnehin nur eine US-Registerprüfung und steht in Spannung zum DE/EU-Fokus.

**Finanzierung**
- Brandomica zeigt, dass ein kostenloser Betrieb scheitern kann. Die Gründe sind nicht geprüft.
- Ob ein klar gekennzeichneter, optionaler Affiliate-Link vertretbar ist, entscheidet der Betreiber. Affiliate-Freiheit ist heute ein Vertrauensmerkmal.

**Produktumfang**
- Bleibt der Generator in der Web-Oberfläche?
- Bleibt `inspect_bundle` als eigenes Tool?
- Bleibt `domain_pricing` mit statischen Preisen „Stand 2026"?
- Die Reviews empfehlen Verschlankung, eine endgültige Entscheidung fehlt.

**Wettbewerb beim Tempo**
- Ergebnisse beim Tippen wie bei IDS sind ohne eigenen Index nicht realistisch.
- Vorgeschlagen ist eine zweistufige Variante: beim Tippen nur günstige, lokale bzw. gecachte Signale, die vollständige Prüfung erst auf Enter. Das ist ein Kompromiss, keine Parität.

**Widersprüche in den Eingaben**
- GitLab: nutzbar vs. verworfen.
- Docker Hub: „zurückgestellt" vs. „verworfen".
- F-Droid: nur die Paket-API ist abgelehnt, die Suche ist nutzbar.

Diese Punkte sollten vor der Umsetzung endgültig entschieden werden.
