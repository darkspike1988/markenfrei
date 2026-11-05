# Implementation Readiness Report: `docs/design.md`, Zeilen 156–216 (DetailedRange)

Stufe 9 der EGM-Review. Drei unabhängige Reviewer: `egm-implementation-readiness` (Standard: implementation-readiness), `egm-codebase-details` (Standard: implementation-readiness, Abgleich mit dem Code), `egm-style` (ohne Standard). Alle drei haben berichtet (Status: completed). Dieser Bericht fasst ihre Findings zusammen und entfernt Doppelungen. Kennungen am Ende: IR = Umsetzungsreife, CB = Codebasis-Details, ST = Stil, mit der Nummer im Roh-Bericht.

**Urteil: nicht umsetzungsreif.** 7 Blocker, 8 Major, 11 Nits. Ein Entwickler müsste mindestens sechs Entwurfsentscheidungen selbst treffen. Drei Aussagen des Plans sind sachlich falsch oder nicht erfüllbar (Tests „unverändert“, Bündel-Kriterium, Testabgleich in `docs-consistency`). Schritt 3 lässt `npm run build:mcp` scheitern, wenn man ihn wörtlich ausführt.

## 🔴 Blocker

### R1. Der Plan nennt seine Voraussetzung nicht und legt offene Entscheidungen still fest (Z. 156–158, 189; Bezug Z. 116–121, 148–154)
- Das Dokument sagt selbst, die Wahl zwischen D und B „gehört vor Beginn der Umsetzung geklärt“. Die Empfehlung lautet A, dann D. Der Plan setzt B ohne Bedingung um, der Hinweis steht 35 Zeilen entfernt.
- Offene Frage 3 (fail-open oder fail-closed) ist in Z. 189 stillschweigend als fail-open entschieden. Offene Frage 2 (IP als „Speicherung von Suchanfragen“) entscheidet über die Datenschutzänderung in Schritt 5.
- **Erwartet:** Ein Eintrittskriterium vor Schritt 1 („Start erst nach Entscheidung B; fail-open beschlossen“), die Entscheidungen 2 und 3 mit Datum und Ergebnis. (IR1, ST-M4; auch Stufe 5 Finding 1, Stufe 7 B1)

### R2. „Tests unverändert“ ist falsch, und die Zielsignaturen fehlen (Z. 158, 166–171, 215–216)
- Z. 167 behält die Signatur `check(key, cost)` bei, „damit die bestehenden Tests unverändert laufen“. Z. 168–169 macht `check` zu `Promise<RateLimitResult>`, Z. 171 verlangt `await` in den Tests. Z. 215–216 verlangt „alle bestehenden Tests unverändert grün“. Das ist nicht erreichbar.
- Betroffen sind synchrone Aufrufe in `tests/rate-limit.test.ts` (u. a. Z. 13–15, 23–24, 31–33, 54–57, 63–64, 74–77) und `tests/api-guard.test.ts` (Z. 133–140). Auch `RateLimiter.check`, `createGuard`, `createProcessGuard` und `guard` (`src/app/api/_lib/http.ts` Z. 183–203) werden zu `Promise`; die exportierten Typen ändern sich (`rate-limit.ts` Z. 15, 94). Der Plan nennt das nicht.
- **Erwartet:** Zielsignaturen für `check`, `RateLimiter`, `createGuard` (`(req, cost?) => Promise<Response | null>`), `createProcessGuard`, `guard`. Abnahme: „bestehende Tests grün, nur um `await` geändert, Assertions unverändert“. (IR2, CB-B2, ST-M1; Stufe 5 Finding 5)

### R3. Das MCP-Bündel wird so nicht gebaut oder ist nicht ioredis-frei (Z. 184–187, 211–212)
- `mcp/build.mjs` (Z. 59–69) bricht mit `process.exit(1)` ab, sobald es nicht eingebündelte Importe außer Node-Builtins findet. Wird `ioredis` „als extern“ markiert (Z. 186), scheitern `npm run build:mcp`, `test:mcp-package` und der CI-Schritt (Z. 33–37). Der Plan nennt diese Prüfung nicht.
- Ohne Extern-Markierung bündelt esbuild das per `import("ioredis")` erreichbare Paket mit. Auch `limit-store-redis.ts` wäre über `engine/http.ts` → `limit-store.ts` im stdio-Bündel erreichbar (`src/mcp/server.ts` → `engine/check` → `http.ts`). Das verletzt die Abnahme in Z. 212.
- „stdio-Betrieb nutzt immer `memoryStore`“ stimmt nicht, solange `getStore()` allein von `MARKENFREI_STATE_URL` abhängt: Ist die Variable in der Umgebung eines stdio-Nutzers gesetzt, scheitert `import("ioredis")`, und `src/mcp/cli.ts` (Z. 68–69) beendet den Prozess über `unhandledRejection`.
- Das Kriterium „enthält kein `ioredis`“ hat keinen Prüfschritt; `mcp/test-package.mjs` prüft das nicht. Für den Next-Build ist offen, wie Turbopack `ioredis` im dynamischen `import()` behandelt (`serverExternalPackages` in `next.config.ts`?), die Datei steht nicht in der Dateiliste.
- **Erwartet:** Konkrete Änderung in `mcp/build.mjs` (Datei, Zeilenbereich, Mechanismus), eine Regel für `getStore()` im stdio-Einstieg (ignoriert die Variable oder bricht mit Meldung ab), ein automatischer Prüfschritt für „kein ioredis im Bündel“, Entscheidung zu `next.config.ts`. (IR6, CB-B3, ST-M3; Stufe 5 Finding 4)

### R4. `getStore()`, `kind` und die zwei Budget-Pfade sind widersprüchlich oder undefiniert (Z. 163, 175–187)
- `getStore()` lädt `redisStore` per `import()`, also asynchron. Schritt 2 ruft `getStore().kind` und `.take(...)` synchron auf. `guardRequest` (`rate-limit.ts` Z. 104–109) und `processGuard` (`_lib/http.ts` Z. 190) entstehen beim Modulimport synchron. Die Signatur von `getStore()` fehlt.
- `kind` ist nirgends definiert (auch nicht der Wert im Rückfall); `LimitStore` hat laut Design nur `take`.
- Schritt 2 behält `takeBudget` (gleitendes Zeitstempel-Log) und fügt `takeBudgetShared` hinzu: zwei Zählverfahren für dasselbe Budget. Offen: Welches läuft im Rückfall? Was ist mit `resetHostBudgets()` in den Tests?
- Z. 180 verlangt einen „gestubbten `LimitStore`“, nennt aber keinen Injektionspunkt. `createHttpClient(opts)` nimmt heute schon `hostBudgets`, `fetchImpl`, `now`, `owner` per Injektion entgegen (`http.ts` Z. 229–245; `check.ts` Z. 43–59, 152–158).
- **Erwartet:** Eine Schnittstelle (`LimitStore` mit `take`, Injektion über `createHttpClient({ store })`), ein einziger Pfad (`memoryStore` übernimmt `takeBudget`) oder eine begründete Doppelung. Das macht `kind`, die Extern-Markierung (R3) und den Sonderweg im Test überflüssig. `src/mcp` importiert heute nichts aus `rate-limit.ts`. (IR4, CB-M1, CB-M2, ST-M2; Stufe 5 Finding 4)

### R5. `createRateLimiter` mit Store: Parameter, Standardwert und Schlüsselraum sind offen (Z. 163–167, 175–177)
- Offen: ob der Store Pflicht oder optional ist und woher der Standard kommt. Die Tests rufen `createRateLimiter({ limit, windowMs, now })` ohne Store auf (`tests/rate-limit.test.ts` Z. 12, 22, 30, 53, 61, 73; `tests/api-guard.test.ts` Z. 132).
- Ist der Standard das Singleton `getStore()`, teilen sich Tests Zähler (mehrere Tests nutzen den Schlüssel `"a"` mit eigenem Fake-Takt). Der Standard muss pro Limiter ein frisches `memoryStore(opts.now)` sein.
- Teilen sich Client-Limit, Prozess-Limit und Host-Budgets denselben `memoryStore`, gilt `MAX_KEYS = 10_000` für alle zusammen. Die Verdrängung „ältester zuerst“ (`rate-limit.ts` Z. 34–39) trifft `process` und `host:itunes.apple.com` zuerst: 10.000 verschiedene Client-IPs setzen das Apple-Budget und das Prozess-Limit zurück. Das ist eine Regression im Standardbetrieb ohne Redis; heute sind die Strukturen getrennt.
- Offen ist ferner, wer `Math.max(1, Math.ceil(cost))` anwendet (Limiter oder Store) und welcher Typ `now` hat.
- **Erwartet:** Vollständige Signatur von `createRateLimiter`, Standard-Store, eigener Store je Verbraucher oder Schutz der Host-Schlüssel vor Verdrängung. (IR3, CB-M3)

### R6. Zählsemantik und Lua-Skript sind unspezifiziert, dabei hängt daran der Zweck des Vorhabens (Z. 175–189, 213–214)
- Der heutige `takeBudget` ist ein gleitendes Fenster in Millisekunden und überschreitet nie. „Festes Fenster mit `INCRBY` und `PEXPIRE`“ erlaubt an der Grenze bis zu 2 × Maximum kurz hintereinander (Apple bis 36). Das ist eine Abschwächung der Garantie, die der Plan nicht als Entscheidung ausweist.
- Das Skript ist nicht beschrieben. Heute verbraucht ein abgelehnter Aufruf nichts (`rate-limit.ts` Z. 47–49; Test „Gewichtung“, `tests/rate-limit.test.ts` Z. 72–78: 8 erlaubt, +3 abgelehnt, +2 erlaubt, +1 abgelehnt). Ein naives `INCRBY` zählt Ablehnungen mit, der Test wäre rot. Offen: Prüfen vor Erhöhen, `PEXPIRE` nur beim Anlegen (NX), `retryAfterSec` aus `PTTL` mit Mindestwert 1, Verhalten bei `cost > limit`, `EVAL` oder `EVALSHA`/`defineCommand`.
- Sekunden statt Millisekunden: `take` liefert ganze Sekunden, mindestens 1. Sub-Sekunden-Fenster wie crates.io (1.000 ms) und Test-Budgets mit 300 und 800 ms (`tests/engine-budget.test.ts` Z. 53, 71) würden auf mindestens 1 s gerundet, der Test „kurze Wartezeit“ (Z. 51–60) hängt davon ab. Z. 179 nennt nur `MAX_BUDGET_WAIT_MS`; der Ist-Code kennt außerdem die Deadline-Grenze `opts.deadlineAt - now() - 1000` (`http.ts` Z. 269) und einen zweiten Versuch nach dem Warten (Z. 273–274). Die Zeitquelle `now()` des Clients steht `LimitStore.take` nicht zur Verfügung.
- **Erwartet:** Lua-Text oder Pseudocode, das gewählte Fenstermodell mit Hinweis auf die Abschwächung, Umrechnung Sekunden/Millisekunden als Formel, korrigierte Abnahmezahl. (IR5, CB-M4, CB-M5; Stufe 7 M1)

### R7. Der Schritt „`tests/docs-consistency.test.ts` erweitern“ ist leer (Z. 206–207)
- Der Test gleicht keine Variablen aus `.env.example` mit der README ab. Er liest `.env.example` nur an zwei Stellen per Regex (Z. 82–86 Packagist-Hinweis, Z. 99 Docker-Hinweis); der Rest prüft Quellen-IDs, Versionsschema und Formulierungen.
- „soweit er … abgleicht“ verschiebt die Entscheidung zum Umsetzer, der Schritt wäre ein No-op oder ein neuer Test mit ungeklärtem Inhalt.
- **Erwartet:** Streichen, oder einen neuen Test mit Dateipfad und Prüfregel spezifizieren (zum Beispiel: jede `MARKENFREI_*`-Variable in `.env.example` steht in der README-Tabelle). (CB-B1, IR13, ST-M6; Stufe 5 Finding 11)

## 🟡 Major

### M1. Verbindung, Zeitüberschreitung und Rückfall von ioredis sind unbestimmt (Z. 188–189)
- 50 ms sind für den Verbindungsaufbau zu knapp; ohne getrenntes `connectTimeout` fällt der erste Aufruf immer zurück. Offen: Umsetzung der 50 ms (`Promise.race`, `commandTimeout`), `lazyConnect`, `enableOfflineQueue: false`, `maxRetriesPerRequest`, `retryStrategy`. Mit ioredis-Standardwerten staut der Client Befehle in der Offline-Queue, 50 ms und „Pause“ wären wirkungslos.
- Offen außerdem: Gilt die 5-Sekunden-Pause global oder je Schlüssel, und welche Uhr (Injektion von `now` für Tests)? Was pausiert, die Redis-Versuche oder der Rückfall selbst (Z. 188–189 gegen Z. 139–141)? Ob ein per Timeout verworfener Befehl später doch zählt (Doppelzählung). Ob der Rückfall-`memoryStore` ein eigenes Objekt ist. Wohin ioredis-`error`-Ereignisse gehen. Wo die Verbindung geschlossen wird (Prozessende, Tests; `redisStore` hat keine Schließfunktion, `tsx --test` hängt sonst). (IR7, CB-M7, ST-N4)

### M2. Ort und Verfahren des HMAC und das Schlüsselschema sind offen (Z. 134, 176–177, 188)
- `redisStore(url, secret)` bekommt das Geheimnis, `take` nur einen `key`. Hasht der Store alle Schlüssel, würden auch `host:…` und `system` gehasht, im Widerspruch zu `mf:host:<host>`. Hasht der Aufrufer, muss `createGuard` den Wert vor `check` ersetzen; gilt das dann auch im Memory-Modus?
- Schlüsselnamen: Plan `"host:" + host`, Design `mf:host:<host>`, `mf:client:<HMAC>`, `mf:system`, Code heute `"process"` und rohe IP (`clientKey`, `rate-limit.ts` Z. 68–76). Wer setzt `mf:`? Im `memoryStore` fehlt ein Präfix, Client- und Budgetschlüssel können kollidieren; `clientKey` fällt auf beliebigen `x-real-ip`-Text zurück. `new URL(url).host` enthält bei Bedarf den Port.
- Festzulegen: Algorithmus (HMAC-SHA-256?), Kodierung, Länge, Format und Mindestlänge von `MARKENFREI_STATE_SECRET`, Folge einer Rotation. Die Datenschutzaussage „keine IP im Speicher“ hängt direkt daran. (IR8, CB-M6, ST-M2)

### M3. Der Startabbruch bei fehlendem Geheimnis hat keinen Ort (Z. 191–192)
- Im Repo gibt es weder `instrumentation.ts` noch `src/instrumentation.ts`, und der Plan legt keinen an. Wirft `getStore()` beim Modulimport, trifft das `next build` (Dockerfile Z. 15) und alle Tests, die Routen importieren. Wirft es lazy beim ersten Aufruf, ist es kein Start-Abbruch, sondern eine 500-Antwort für Nutzer.
- Offen: Wortlaut der deutschen Meldung (ohne Passwort aus der URL), Verhalten für stdio und `npm run mcp`. Für diesen Abbruch ist in Schritt 4 kein Test vorgesehen. (IR9, CB-M8)

### M4. Der Testplan hat Lücken und Fallen (Z. 171, 180, 194–199)
- Die Datei `tests/limit-store-redis.test.ts` wird komplett übersprungen, wenn `TEST_REDIS_URL` fehlt. Der Rückfall bei nicht erreichbarem Speicher braucht aber kein Redis und bliebe in `npm test` ungetestet. Er gehört außerhalb des Skips.
- „Ablauf nach Fenster“ gegen echtes Redis kann `now` nicht einspeisen und braucht echtes Warten; Fensterlänge, Aufräumen der Schlüssel und Isolation zwischen Läufen fehlen.
- Es fehlen Tests für `memoryStore` selbst (Fenster, Kosten, `MAX_KEYS`, Aufräumen ab 2000; `tests/limit-store.test.ts` steht nicht in der Dateiliste), `cost > limit`, „abgelehnt verbraucht nichts“, `retryAfterSec`-Werte, TTL ≤ 300 s, keine Roh-IP in Redis (`KEYS mf:*`), Auswahl in `getStore()`, Geheimnisprüfung, genau ein Rückfall nach Timeout und Wiederaufnahme nach 5 s (Fake-Uhr), hängender Server mit offener Verbindung, MCP-Bündel mit gesetzter `MARKENFREI_STATE_URL`.
- Der gestubbte Store in `engine-budget.test.ts` braucht benannte Fälle (Budget erschöpft → `error: "budget"`; Wartezeit unter 1.500 ms → wartet und läuft). (IR10, CB-M10)

### M5. Dateiliste, Abhängigkeit und betroffene Stellen sind unvollständig (Z. 161–207)
- `package-lock.json` fehlt: CI (`ci.yml` Z. 24–25) und Dockerfile (Z. 9) nutzen `npm ci` und brechen ab. In der Sperrdatei steht kein `ioredis`. Version und Bereich stehen nicht im Plan.
- Create/Modify/Delete ist nicht gekennzeichnet (nur Schritt 1 sagt „Neue Datei“). Nicht oder nur indirekt genannt: `src/app/api/_lib/http.ts`, `src/lib/engine/http.ts`, `next.config.ts`, die Stelle für den Startabbruch, `src/app/datenschutz/page.tsx` (Plan: nur „Datenschutzerklärung“), `tests/limit-store.test.ts`.
- Texte mit „pro Prozess“ außerhalb von Schritt 5: Kommentar in `rate-limit.ts` Z. 4–8, `engine/http.ts` Z. 20–24, `CONTRIBUTING.md` Z. 42, `src/README.md` Z. 32, `.env.example` Z. 36–38, README Z. 202, 220–221, 235. Ändert sich die Bedeutung von `MARKENFREI_GLOBAL_RATE_LIMIT` und `MARKENFREI_RATE_LIMIT` mit gesetzter URL von „pro Prozess“ zu „gesamt“, gehört das in Schritt 1 oder 3; ob der Standardwert 600 gleich bleibt oder mit N wächst, ist offen. (IR11, CB-M9, CB-M14; Stufe 7 M6)

### M6. Infrastruktur- und Doku-Schritte sind keine ausführbaren Anweisungen (Z. 190–207)
- `docker-compose.yml`: Es fehlt ein Redis-Dienst. `redis://127.0.0.1:6379` im Container zeigt auf den Container selbst. Offen: Image und Version (Redis oder Valkey), Netzwerk, Port-Bindung nur lokal (wie Z. 9–12 der Datei), Passwort und TLS, `depends_on`, Persistenz aus (Datenschutz). Variablen kommen über `env_file`; `.env.example` Z. 3–4 verlangt, sie dort zu halten, was in `environment:` ergänzt werden soll, ist offen.
- CI (`ci.yml`, ein Job `validate`): Image, Version, `services:`-Block, Port, Health-Check, Wert und Schritt für `TEST_REDIS_URL` fehlen. `test:mcp-package` startet ohne Redis und muss grün bleiben (R3).
- Datenschutzerklärung (`page.tsx` Z. 66–69: „im Arbeitsspeicher“, „Zähler wird nicht gespeichert“): kein Wortlaut; die Seite ist statisch, die Variable optional, ob der Text bedingt ist, bleibt offen. Das hängt an Frage 2.
- README (Variablentabelle Z. 194–203, Punkte 4 und 8) und ROADMAP (Z. 76): „anpassen“ ohne Zieltext oder neuen Status. Je Datei sollte eine konkrete Änderung benannt werden. `.env.example`: Beispielwerte und Erzeugung des Geheimnisses (`openssl rand -hex 32`) als auskommentierter Eintrag. (IR12, CB-M11, CB-M12, ST-N7)

### M7. Die Abnahme ist nicht automatisiert prüfbar (Z. 211–216)
- „Zwei lokale Prozesse … gezählt am gestubbten `fetch`“: Die Route `check` ruft `checkNames(body.names, opts)` ohne `fetchImpl` (`check/route.ts` Z. 85); ein laufender Next-Prozess hat keinen Hook zum Stubben. Machbar wäre ein Skript mit überschriebenem `globalThis.fetch` in zwei Prozessen (Vorbild: `tests/api-routes-guard.test.ts` Z. 22–25, aber in einem Prozess). Weder Datei noch Aufruf stehen im Plan, ebenso fehlen Redis-Start und Ports.
- Bei festem Fenster kann ein Lauf über die Fenstergrenze 20 statt 18 Anfragen auslösen; das erwartete Ergebnis der übrigen Prüfungen (vermutlich `unknown` mit `retryable: true`) fehlt. `appstore` ist Standardquelle und kann bei `retry: true` und 429/5xx zwei Anfragen auslösen (`http.ts` Z. 336–344): „höchstens 18“ passt zur Budgetzählung, nicht zur Zahl der Namen. Der Zwischenspeicher wird mit „neuen Namen“ nur vermutlich umgangen.
- Das Rückfallverhalten wird nur indirekt über Schritt 4 geprüft, nicht in der Abnahmeliste. (IR14, CB-M13, ST-M5)

### M8. Die Phasen sind nicht alle einzeln baubar und prüfbar (Z. 158–159, 211)
- „Schritte 1 bis 3 ändern das Verhalten ohne gesetzte Variable nicht“ stimmt für Schritt 3 nicht (R3). „Jeder Schritt lässt `npm test` und `npm run lint` grün“ lässt `build`, `build:mcp` und `test:mcp-package` aus, obwohl die CI sie ausführt. `ioredis` kommt in Schritt 3 hinzu, wird aber erst in Schritt 4 getestet. Schritt 1 verändert zumindest den Ablauf (asynchron), „Verhalten“ sollte auf „Antworten und Grenzen“ präzisiert werden. Zusicherungen stehen doppelt (Z. 158 und 211, 215–216).
- **Erwartet:** Je Schritt ein Prüfbefehl mit Erwartung. (IR15, CB-N3, ST-N2)

## 🟢 Nits

- **Sprache und Überschrift:** „Detailed Implementation Plan“ (Z. 156) ist die einzige englische Überschrift; „gestubbt“ (Z. 180, 214) erklären oder ersetzen; „nächsten freien Platz“ (Z. 179) kollidiert mit dem Begriff „Slot“, besser „bis das Budget wieder frei ist“; `MAX_BUDGET_WAIT_MS` als „bestehende Konstante“ kennzeichnen. (ST-N1, N8)
- **Begriffe:** „Speicher“ meint abwechselnd `LimitStore`, Prozessspeicher, Redis und Arbeitsspeicher; im Plan konsequent `LimitStore`, `memoryStore`, `redisStore`, „Redis“ verwenden; „Tests gegen echten Speicher“ besser „gegen einen Redis-Server“. (ST-N3)
- **Satzbau:** Z. 166–171 ist ein überlanger Satz, in zwei bis drei Sätze oder Spiegelstriche teilen; `RateLimitResult` wird dort erstmals genannt, Z. 128 nutzt `{ allowed, retryAfterSec }`. Z. 196–198: Verb im zweiten Teil fehlt, „startet“ passt nicht zu einer Testdatei („läuft nur“), die Aufzählung nach „Geprüft werden:“ ist nicht parallel. Der Codeausdruck in Z. 176–177 bricht mitten im Code-Span um. (ST-N5, N6, N8)
- **Konkretisieren:** Z. 170: Aufrufstellen `check/route.ts` Z. 81, `mcp/route.ts` Z. 47, `opendata-words/route.ts` Z. 80 (`guard(...)` → `await guard(...)`), `_lib/http.ts` Z. 202 (`??` über zwei Promises). Z. 163: Rückgabetyp und `now`-Form von `memoryStore`. Z. 188: Export und Rückgabetyp von `redisStore` samt Schließen der Verbindung. Schritt 5: je Datei benennen, was sich ändert; ROADMAP-Status (✅, Datum) und Zeile 26 („Last“) klären. (CB-N1, N2, IR-Nits, ST-N7)
- **Abnahme „kein ioredis im Bündel“:** Prüfverfahren angeben (zum Beispiel Suche im Bündel in `test-package.mjs`). (IR6, ST-Hinweise)
- **GitHub:** Der Plan behandelt `api.github.com` nicht; klarstellen, dass die GitHub-Sperre ausdrücklich nicht Teil der Änderung ist. (IR-Nits; Stufe 7 M4)
- **Außerhalb des Bereichs:** Z. 100–103 schreibt der README zu, „die Budgets pro Prozess zu senken“. Das steht dort nicht (README Z. 220–221, 248–249); der Satz steht nur im Kommentar `engine/http.ts` Z. 23. (CB)

## Geprüft und korrekt

`createRateLimiter` (festes Fenster, `MAX_KEYS`, Aufräumen), `createGuard`/`guard`/`createProcessGuard`, die drei Routen und ihre `guard`-Aufrufe, `takeBudget`/`budgetLog`/`MAX_BUDGET_WAIT_MS`, `acquireSlot` (bleibt im Prozess), `mcp/build.mjs`, `ci.yml`, `.env.example`, `docker-compose.yml`, README-Tabelle, ROADMAP Z. 76 sowie die Skripte `build:mcp` und `test:mcp-package` existieren wie beschrieben. Im Ablauf des Plans ist der Ist-Zustand korrekt wiedergegeben; die Mängel liegen in den neuen Teilen.

## Zusammenfassung der nötigen Klärungen vor Start

1. D oder B beschlossen, fail-open bestätigt (R1).
2. Zielsignaturen für `check`, `createRateLimiter`, `createGuard`, `createProcessGuard`, `guard`, `getStore()` und Injektion über `createHttpClient` (R2, R4, R5).
3. Fenstermodell und Lua-Text, Umrechnung Millisekunden/Sekunden (R6).
4. Build-Mechanik für MCP-Bündel und Next, Prüfschritt „kein ioredis“ (R3).
5. HMAC-Verfahren, Schlüsselschema, ioredis-Konfiguration, Ort der Startprüfung (M1–M3).
6. Vollständige Dateiliste samt `package-lock.json`, Testfälle, Compose-, CI- und Doku-Texte, automatisierbare Abnahme (M4–M8, R7).
