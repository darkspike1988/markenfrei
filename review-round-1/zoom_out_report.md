# Zoom-Out-Review: `docs/design.md` (Zeilen 1 bis 216)

Stufe 5 der EGM-Review. Reviewer: `egm:egm-zoom-out`. Kontext: `docs/v2-spec.md`, `docs/trademark-registers.md`.

**Gesamturteil: nicht bestanden.** Es gibt einen Blocker. Der Zweck ist klar, der Kontext reicht, und die Ablaufbeschreibung stimmt weitgehend mit dem Code überein. Das Dokument widerspricht sich aber selbst. Sein Umsetzungsplan baut die aufwendigste Variante, obwohl der Autor sie nicht empfiehlt und der Bedarf nicht belegt ist.

Zur Methode: Die Behauptungen wurden gegen den Code geprüft. Gelesen wurden `src/lib/rate-limit.ts`, `src/lib/engine/http.ts`, `src/app/api/_lib/http.ts`, `mcp/build.mjs`, `docker-compose.yml`, `ROADMAP.md`, die README und `tests/docs-consistency.test.ts`. Gesucht wurde außerdem nach Redis-Resten in `src/`, `package.json`, CI und `mcp/`, ohne Treffer. Es gibt also keinen bestehenden Speicher zum Wiederverwenden, nur den Prozessspeicher.

## Findings

### 1. Blocker: Der Plan setzt Option B um, die das Dokument selbst nicht empfiehlt
**Scope:** Zeilen 116–121 gegen 156–216 (Empfehlung, Plan, Abnahme).

- Die Empfehlung lautet: A, solange ein Prozess reicht, bei Bedarf zuerst D, B nur für das Client-Limit und nur falls es "tatsächlich umgangen wird".
- Direkt danach plant das Dokument B "für beides" und nennt die Entscheidung D oder B "offen". Sie "gehört vor Beginn der Umsetzung geklärt".
- Das ist ein Plan für eine noch nicht getroffene Entscheidung. Ein Leser kann nicht erkennen, ob er Schritt 1 beginnen darf.
- Bedarf ist nicht belegt:
  - `docker-compose.yml` startet genau einen Container.
  - Laut README Punkt 8 reicht eine Instanz mit 1 vCPU und 1 GB bei etwa 4 bis 5 Prüfungen pro Sekunde.
  - Die ROADMAP (Zeile 76) hat den Auslöser "Betrieb mit mehr als einer Instanz" als ⬜ stehen. Er ist nicht eingetreten.
- Ein Ausfall von Dritten ist dagegen nur ein theoretisches Risiko. Das ist spekulative Skalierung (YAGNI).
- **Vorschlag:** Das Dokument zu einem reinen Entscheidungsdokument machen und den Plan streichen oder als "bedingt, nur nach Entscheidung B" markieren. Alternativ den Plan auf D zuschneiden.

### 2. Major: Der Umfang ist zu groß für das eigentliche Problem
**Scope:** Zeilen 16–19, 33–35, 130–146, Offene Fragen 1–2.

- Das Problem sind die Budgets je Zieldienst (Apple 18/min, crates.io 1/s und weitere). Der Proxy kann sie nicht zählen (Zeilen 100–103).
- Die Client- und Systemgrenzen kann der Proxy bereits zusätzlich begrenzen. Das sagt das Dokument selbst und die README Punkt 4.
- Der Überschuss ist beschränkt: höchstens N × 60 je Client und N × 600 im System. Das ist kein Sicherheitsproblem.
- Wer auch das Client-Limit teilt, zieht Folgekosten nach sich:
  - IP-Hashing mit Geheimnis (`MARKENFREI_STATE_SECRET`).
  - Abbruch beim Start, wenn das Geheimnis fehlt.
  - Eine Datenschutzfrage (Offene Frage 2).
  - Eine Änderung der Datenschutzerklärung.
- Das Dokument vermischt zwei Probleme unterschiedlicher Größe. Es nennt sie in Ziel 1 gemeinsam, obwohl es das Client-Limit selbst nur "falls tatsächlich umgangen" will.
- **Vorschlag:**
  - Ziel eng fassen: Nur das Budget je Zieldienst wird geteilt.
  - Bei Redis/Valkey käme dann keine IP in den Speicher. Das Geheimnis und die Frage 2 entfallen.
  - Das Client-Limit bleibt am Proxy.

### 3. Major: Option D ist die einfachste Lösung und im Plan nicht ausgearbeitet
**Scope:** Zeilen 114, 116–119.

- D deckt laut Dokument das Hauptproblem ab, ohne neuen Dienst: eine Zahl, die die Werte in `HOST_BUDGETS` (`src/lib/engine/http.ts`, Zeilen 43–50) teilt.
- Der Plan gibt D keine Abnahmekriterien und keinen Schritt. B bekommt dagegen fünf Schritte plus CI-Dienst und neue Abhängigkeit.
- `HOST_BUDGET_SHARE` steht in der Tabelle wie ein vorhandener Bezeichner. Es gibt ihn im Code nicht. Als Vorschlag kennzeichnen.
- Die Kosten von D ("ungleichmäßige Last verschwendet Budget") sind bei Budgets, die ohnehin knapp geschnitten sind, gering. Das Dokument gewichtet sie nicht gegen den Aufwand von B.

### 4. Major: Falsche Schicht und Reuse-Verstoß: ein globales `getStore()` in der Engine
**Scope:** Zeilen 163, 175–179, 184–187.

- `src/lib/engine/http.ts` ist die Bibliothek, die auch das stdio-MCP-Bündel nutzt. `src/mcp` importiert dort nichts aus `rate-limit`.
- Ein Modul-Singleton `getStore()` mit Umgebungsvariable und dynamischem `import()` koppelt die Engine an den Betrieb. Das ist ein Architekturproblem, kein Detail.
- Der Code hat dafür schon ein Muster: `createHttpClient(opts)` nimmt `hostBudgets`, `fetchImpl` und `now` per Injektion entgegen (Zeilen 229–245). Ein optionales `budgetStore` in diesen `opts` wäre konsistent. Es würde `getStore().kind` überflüssig machen. Die Routen oder `check.ts` würden den Speicher übergeben.
- Zwei Pfade `takeBudget` und `takeBudgetShared`, gewählt über `getStore().kind`, lassen die Abstraktion durchsickern. Wenn `memoryStore` `LimitStore` erfüllt, genügt ein Pfad.
- Der Plan übersieht eine Hürde: `mcp/build.mjs` bricht in Zeilen 59–69 mit `exit(1)` ab, sobald das Bündel einen nicht eingebündelten Import hat. Das gilt auch für einen als extern markierten und dynamisch geladenen `ioredis`.
  - Schritt 3 sagt nur, `build.mjs` solle `ioredis` als extern markieren. Dann würde dieser Check auslösen.
  - Das Dokument nennt diese Änderung nicht.
  - Mit Injektion über die Routen wäre `ioredis` gar nicht im MCP-Importgraphen. Dann braucht es weder Extern-Markierung noch Sonderfall im Check.

### 5. Major: Der Plan widerspricht sich bei "Tests unverändert" und führt eine unnötige Asynchronität ein
**Scope:** Zeilen 166–171 gegen 215–216.

- Schritt 1 sagt, die bestehende Signatur bleibe, "damit die bestehenden Tests unverändert laufen". Im nächsten Satz wird `check` zu `Promise<RateLimitResult>`. Aufrufer und Routen (`check`, `mcp`, `opendata-words`) wechseln auf `await`, und die Tests müssen ebenfalls angepasst werden (Zeile 171).
- Die Abnahme verlangt trotzdem "alle bestehenden Tests unverändert grün" (Zeile 216). Das ist nicht erfüllbar. `tests/rate-limit.test.ts` und `tests/api-guard.test.ts` rufen `check` synchron auf.
- Die Asynchronität zieht sich durch `guardRequest`, `createGuard`, `createProcessGuard` und `guard`. Das passiert nur, damit eine optionale Implementierung asynchron sein darf.
- Wenn die Variante in Finding 2 gilt, bleibt der gesamte Client- und Systempfad synchron und unberührt. Dann ist nur der Budgetpfad betroffen, und der wartet ohnehin schon asynchron (`await new Promise(setTimeout)`).

### 6. Major: Das Zählverfahren ändert sich still, und das Abnahmekriterium ist damit unscharf
**Scope:** Zeilen 137–138, 163–164, 213–214.

- Der Code nutzt für Budgets ein gleitendes Fenster als Zeitstempel-Log (`takeBudget`, Zeilen 54–70). Das Client-Limit nutzt ein festes Fenster.
- Das Dokument will beide hinter dasselbe `INCRBY`/`PEXPIRE` setzen, also ein festes Fenster.
  - An der Fenstergrenze sind dann bis zu 2 × 18 Apple-Anfragen in kurzer Zeit zulässig.
  - Dabei ist 18 pro Minute genau die dokumentierte Grenze, die Apple setzt.
- Die Abnahme "20 Prüfungen in einer Minute, höchstens 18 Anfragen" ist deshalb nicht deterministisch. Eine Minute kann zwei Zählfenster berühren.
- `retryAfterSec` hat Sekundengenauigkeit. Der Code arbeitet für Budgets in Millisekunden, etwa bei crates.io mit 1 Anfrage pro Sekunde.
- Das Dokument benennt diese Abschwächung nirgends als Nachteil von B. Sie trifft den Kern des Problems. Entweder ein gleitendes Fenster in Redis vorsehen (aufwendiger) oder den Verlust ausdrücklich nennen und das Abnahmekriterium korrigieren.

### 7. Major: Die Begründung für "kein gemeinsamer Zwischenspeicher" ist unvollständig, und GitHub fehlt
**Scope:** Zeilen 39–40, 87, 98–99.

- Die Begründung lautet, der Cache verändere "nur die Zahl der Abfragen". Genau diese Zahl verbraucht aber das knappe Budget (README Punkt 8: "Wiederholte Namen … zählen nicht").
- Bei N Prozessen mit je eigenem Cache trifft derselbe Name bis zu N-mal auf die Quelle. Ein gemeinsames Budget wird so schneller leer, und Nutzer sehen eher `unknown` mit `error: budget`.
- Das Dokument sollte diese Folge nennen und begründen, warum sie hinnehmbar ist (zum Beispiel durch Sticky Routing, Option C, für die Cache-Trefferquote).
- Die GitHub-Sperre erscheint in der Problembeschreibung (Zeilen 98–99), aber nicht in den Zielen und nicht im Plan.
- Das Budgetproblem bleibt für GitHub also ungelöst, und das Dokument sagt das nicht. README Punkt 8 verweist als Gegenmittel auf `GITHUB_TOKEN`. Das gehört in den Text.

### 8. Major: Der Datenschutzpunkt ist halb gelöst, und ein Widerspruch zur Zusage bleibt unerwähnt
**Scope:** Zeilen 85, 143–146, 151–152, 190–192.

- Die Entscheidungstabelle begründet "Zustand im Arbeitsspeicher" mit "nichts auf der Platte, passt zur Datenschutzzusage". Als verworfene Alternative steht dort "Datenbank oder Redis von Anfang an".
- Der Vorschlag dreht das um. Der Tabelleneintrag wird nicht abgeglichen und die Begründung nicht aufgehoben.
- Redis schreibt standardmäßig Snapshots oder ein Append-Only-File auf die Platte. Der Plan verlangt nicht, das auszuschalten. Die README sagt aber bei `MARKENFREI_CACHE_TTL_SEC`: "nichts wird auf die Platte geschrieben".
- Offene Frage 2 klärt nur den Hash. Die Frage nach Persistenz fehlt.
- Wird der Vorschlag auf Budgets begrenzt (Finding 2), entfällt der Punkt weitgehend.

### 9. Nit: Das Dokument gibt den heutigen Stand falsch wieder
**Scope:** Zeilen 100–103.

- "README … Punkte 4 und 8: … die Budgets pro Prozess senken" steht so nicht in der README. Punkt 4 sagt nur "zusätzlich am Proxy begrenzen". Punkt 8 sagt "Budgets gelten pro Prozess".
- Die Empfehlung D (Budgets teilen) ist also kein bereits dokumentierter Weg. Sie ist neu und sollte als neuer Vorschlag erscheinen.

### 10. Nit: Plan- und Verhaltensabschnitt rutschen in Implementierungsdetails
**Scope:** Zeilen 134–142, 161–199.

Hier steht Code-Ebene, die in ein Designdokument nicht gehört:
- Schlüsselnamen (`mf:client:<HMAC der IP>`) und der Lua-Aufruf mit `INCRBY` und `PEXPIRE`.
- Timeouts von 50 ms und 5 s.
- Der Funktionsname `takeBudgetShared` mit seiner Argumentliste.
- Die Signatur `memoryStore(now?)`.
- Der Rückgabewert `{ allowed, retryAfterSec }`.
- Der Hinweis "`MAX_KEYS`, Aufräumen".

Für die Architekturentscheidung zählen Schnittstelle, Ausfallverhalten und Datenfluss. Die Einzelheiten gehören in den Umsetzungsplan, der nach der Entscheidung entsteht.

### 11. Nit: Unklare Entscheidungen im Plan, und eine Test-Annahme stimmt nicht
**Scope:** Zeilen 139–142, 153–154, 206–207.

- Fail-open ist im Verhalten bereits festgelegt (Zeilen 139–142), Offene Frage 3 fragt aber nach fail-closed. Entweder ist es entschieden oder offen.
- Schritt 5 sagt, `tests/docs-consistency.test.ts` solle erweitert werden, "soweit er Variablen aus `.env.example` mit der README abgleicht". Er tut das nicht. Er prüft README, `mcp/README.md` und `.env.example` auf anderes (Zeilen 82 und 97). Die Bedingung ist als Hedge formuliert, der Autor hat es nicht geprüft.
- Der Systemlimit-Wechsel ändert die Bedeutung von `MARKENFREI_GLOBAL_RATE_LIMIT` ("pro Prozess", Zeile 235 der README) bei gesetzter `MARKENFREI_STATE_URL` in "gesamt". Das ist eine stille Semantikänderung einer bestehenden Variable und sollte genannt werden.

### 12. Nit: Der Systemüberblick wiederholt `v2-spec.md`
**Scope:** Zeilen 45–75.

- Der Abschnitt dupliziert Ampelregeln, Cache-Regeln und Quellenmodell aus `v2-spec.md`. Das Dokument erklärt selbst, dass `v2-spec.md` verbindlich bleibt. Zwei Texte für dieselben Regeln können auseinanderlaufen.
- Für den Vorschlag reichen die Bausteine, die er berührt (Wächter, HTTP-Client, Cache), plus ein Link.

## Zusammenfassung der Empfehlung

1. Entscheidung treffen oder den Plan bedingt formulieren (Finding 1).
2. Umfang auf die Budgets je Zieldienst begrenzen oder D umsetzen (Findings 2 und 3). Das Client-Limit bleibt am Proxy, es sei denn, ein Umgehen ist belegt.
3. Den Speicher in `createHttpClient(opts)` injizieren. Kein globales `getStore()` in der Engine, keine zusätzliche Async-Welle (Findings 4 und 5).
4. Das gleitende Fenster der Budgets bewahren oder die Abschwächung ausdrücklich benennen (Finding 6).
5. Cache-Folgen, GitHub und die Redis-Persistenz ehrlich im Dokument behandeln (Findings 7 und 8).
