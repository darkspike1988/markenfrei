# Zoom-Out-Review Stufe 8: `docs/design.md` (Zeilen 1 bis 216)

Zwischenreview (Simplicity und Scope) der EGM-Review. Reviewer: `egm:egm-zoom-out`. Quellen: Design-Dokument, Berichte der Stufen 5, 6 und 7, `docs/v2-spec.md`, `docs/trademark-registers.md`. Gegengeprüft wurden README (Punkte 4, 6 und 8), `ROADMAP.md` Z. 76, `docker-compose.yml`, `src/lib/engine/http.ts` und die Suche nach Redis-Resten im Repo. Es wurde nichts geändert.

## Gesamturteil: nicht bestanden. Der Blocker aus Stufe 5 ist unverändert offen.

Das Dokument wurde seit Stufe 5 nicht geändert. Der Blocker besteht deshalb unverändert. Das Dokument plant Option B (Redis für alles), empfiehlt aber A, dann D, und B nur für das Client-Limit. Seine eigene offene Frage 1 sagt, die Entscheidung gehöre vor den Beginn der Umsetzung geklärt.

Die Stufen 6 und 7 haben diesen Kernbefund bestätigt. Ihre Gegenmaßnahmen führen aber nicht automatisch zu einem fokussierten Dokument. Wenn man sie alle umsetzt, wächst das Dokument von einem Vorschlag zu einem Betriebs-, Datenschutz- und Redis-Härtungskonzept für eine Funktion, deren Bedarf nirgends belegt ist. Die Findings, die den Umfang verkleinern, und die, die ihn vergrößern, ziehen in entgegengesetzte Richtungen. Zuerst muss das Dokument entscheiden, was es sein will.

Hinweis: Stufe 7 nennt 2 Blocker, 13 Major und 12 Nits; in `critic_report.md` stehen 2, 13 und eine Nit-Liste mit etwa 11 bis 12 Punkten. Das ändert an der Bewertung nichts.

## Findings

### 1. Blocker: Der Entscheidungskonflikt aus Stufe 5 ist offen. Er muss vor jeder Ergänzung gelöst werden.
**Scope:** Z. 116 bis 121 gegen Z. 156 bis 216 (Empfehlung gegen Plan und Abnahme)

- Der Plan setzt Option B für Client-Limit, Systemlimit und Budgets um. Die Empfehlung (Z. 116 bis 119) sagt: A, dann D, B höchstens für das Client-Limit. D hat keinen Plan und keine Abnahme.
- Der Bedarf fehlt weiterhin. Gegengeprüft:
  - `docker-compose.yml` startet einen Container.
  - Im Repo gibt es keine Redis-Reste.
  - `ROADMAP.md` Z. 76 führt "Rate-Limit über mehrere Instanzen" als ⬜ mit dem Auslöser "Betrieb mit mehr als einer Instanz". Er ist nicht eingetreten.
  - README Punkt 8 sagt, eine Instanz mit 1 vCPU und 1 GB reiche. Den Engpass setzen die Zieldienste. Ein zweiter Prozess auf derselben IP bringt keinen Durchsatz (README Z. 248 bis 249).
- Stufe 7 (B2) nennt Verfügbarkeit, also Zero-Downtime-Deploys, als möglichen echten Nutzen. Das ist ein vernünftiger Verdacht, aber im Dokument nicht belegt. Es sollte als Hypothese aufgenommen werden und nicht als eigenes Projekt wachsen.
- **Simplicity-Begründung:** Das Dokument ist ein Plan für eine noch nicht getroffene Entscheidung zu einem noch nicht eingetretenen Bedarf. Der Plan baut die aufwendigste Option: neue Abhängigkeit, neuer Dienst, `await`-Umbau durch die Routen, CI-Dienst, Datenschutzänderung.
- **Richtung:** Das Dokument sollte ein Entscheidungsdokument sein, das A festhält und D als nächste Stufe sowie B als Eskalationsstufe mit Auslöser benennt. Der B-Plan (Z. 156 bis 216) sollte entfallen oder als "bedingt, nur bei Entscheidung B" abgetrennt werden. Das hat Vorrang vor allen anderen Findings.

### 2. Major: Option D bleibt unausgearbeitet, und es ist die einzige Option, die dem Problem proportional ist.
**Scope:** Z. 114, 116 bis 119

- `HOST_BUDGETS` ist hartkodiert (`src/lib/engine/http.ts` Z. 43). Ein Konfigurationsweg fehlt. D wäre ein kleiner Eingriff an einer Stelle: ein Divisor oder eine Prozesszahl, die die Budgets beim Aufbau von `createHttpClient` teilt. `createHttpClient(opts)` nimmt schon `hostBudgets` entgegen (Z. 238 und 264). Es braucht also nicht einmal neue Struktur.
- Die Stufe-6-Kritik an `HOST_BUDGET_SHARE` (Format, Standardwert, Rundung bei 1 pro Sekunde, fehlendes Präfix `MARKENFREI_`) ist berechtigt. Die Behebung dafür ist jedoch klein: ein Absatz, kein neuer Abschnitt.
- **Simplicity-Begründung:** D löst das Hauptproblem (Budgets je Zieldienst) ohne neuen Dienst. Die Kosten von D (Budget wird bei ungleicher Last verschwendet) sind bei Budgets, die ohnehin knapp sind und vom Dokument selbst als schutzwürdig beschrieben werden, nur die sichere Richtung. Ein Fehler führt zu `unknown` mit `retryable: true`, nie zu einer Sperre durch Dritte.

### 3. Major: Der Vorschlag ist größer als das Problem. Der Scope sollte auf Zieldienst-Budgets begrenzt werden.
**Scope:** Z. 16 bis 19, 33 bis 35, 130 bis 146, Offene Fragen 1 und 2

- Die Client- und Systemgrenzen kann der Reverse-Proxy bereits begrenzen. README Punkt 4 sagt das ausdrücklich. Das Dokument bestätigt es selbst (Z. 100 bis 103). Der Überschuss ist beschränkt: höchstens N × 60 je Client und N × 600 im System.
- Nur die Budgets je Zieldienst kann der Proxy nicht zählen. Das ist die einzige Lücke, die der Proxy nicht schließt.
- Wer das Client-Limit teilt, zieht den größten Teil der Folgekosten nach sich: IP-Hashing, `MARKENFREI_STATE_SECRET`, Startabbruch, Rotation des Geheimnisses, Datenschutzfrage, Änderung der Datenschutzerklärung und `await`-Umbau durch alle Routen. Das Dokument hält B für das Client-Limit selbst nur "falls tatsächlich umgangen" für nötig.
- **Simplicity-Begründung:** Auf Budgets begrenzt würde keine personenbezogene Information in den Speicher gelangen. Schlüssel wie `host:<host>` sind Klartext ohne Personenbezug. Dann entfallen Geheimnis, Offene Frage 2, Datenschutzänderung und die Synchron-Asynchron-Umstellung des Client- und Systempfads. Das ist der Hebel mit der größten Wirkung auf die Dokumentgröße.

### 4. Major: Das Dokument hat ein Altitude-Problem, und die Stufe-6/7-Ergänzungen würden es verschärfen.
**Scope:** Z. 134 bis 142, 161 bis 199

- Das Dokument enthält bereits Implementierungsdetails: Schlüsselnamen, Lua-Aufruf mit `INCRBY` und `PEXPIRE`, 50 ms, 5 s, `takeBudgetShared(host, budget)`, `memoryStore(now?)`, `MAX_KEYS`, `MAX_BUDGET_WAIT_MS`. Die Details stehen im Konflikt mit der offenen Entscheidung (Finding 1).
- Stufe 7 (M2, M5, M8, M9) will weitere Detailentscheidungen im Dokument festlegen: ioredis `enableOfflineQueue`, `save ""` und `appendonly no`, `maxmemory` mit Eviction-Policy, TLS und Authentifizierung, Rotation des Geheimnisses, Millisekunden in `retryAfter`, ZSET-Log, Jitter in der Wartelogik, Redis-Round-Trips pro Prüfung.
- **Simplicity-Begründung:** Alle diese Punkte sind für eine B-Umsetzung richtig. Sie gehören in einen B-Umsetzungsplan, der erst nach der Entscheidung entsteht. Sie jetzt ins Designdokument zu schreiben, verfestigt B, bevor es beschlossen ist. Das Dokument soll Schnittstelle, Ausfallverhalten, Datenfluss und Risiken auf Designebene beschreiben und die Konfiguration von Redis an den Betriebsplan abgeben.

### 5. Major: Der Schichtfehler `getStore()` in der Engine ist nur bei B relevant, aber berechtigt und bleibt offen.
**Scope:** Z. 163, 175 bis 179, 184 bis 187

- Gegengeprüft: `createHttpClient(opts)` nimmt `hostBudgets`, `fetchImpl` und `now` per Injektion entgegen. Das Muster ist da. Ein globales `getStore()` mit Umgebungsvariable und dynamischem `import()` bricht mit diesem Muster und koppelt die Engine, die auch das stdio-MCP-Bündel nutzt, an den Betrieb.
- Zwei Pfade (`takeBudget` und `takeBudgetShared`), gewählt über `getStore().kind`, lassen die Abstraktion durchsickern. `kind` ist nirgends definiert (Stufe 6, Finding 5).
- Falls B kommt, sollte das Dokument festlegen: Der Speicher wird in `createHttpClient(opts)` injiziert und die Route oder `check.ts` übergibt ihn. Das ist ein Satz auf Designebene und erspart `getStore().kind`, die Extern-Markierung und den Sonderfall im Build.
- Zusatz zu Stufe 5: `mcp/build.mjs` bricht laut Stufe 5 bei nicht eingebündelten Imports ab. Die Injektion über die Routen vermeidet dieses Problem, ohne dass `build.mjs` angefasst wird.

### 6. Major: Zwei Aussagen im Dokument sind sachlich falsch. Sie sind klein zu beheben und sollten aus dem Dokument verschwinden, nicht ausgebaut werden.
**Scope:** Z. 119 bis 120, 137 bis 138, 166 bis 171, 215 bis 216; Z. 87, 100 bis 103

- **Fensterart.** "Exakt" und festes Fenster passen nicht zusammen. Das Dokument kann das auf zwei Arten beheben:
  - Es sagt, "hält die Grenzen ein, solange der Speicher erreichbar ist", und benennt den Burst an der Fenstergrenze.
  - Oder es hält fest, dass das gleitende Fenster erhalten bleibt.
  - Mit D (Finding 2) stellt sich die Frage nicht, weil der bestehende `takeBudget` unverändert bleibt. Das ist ein eigenständiges Argument für D.
- **Tests und Async.** Die Abnahme "alle bestehenden Tests unverändert grün" (Z. 216) widerspricht Z. 171, wo Tests auf `await` angepasst werden. Der Widerspruch fällt weg, wenn der Scope auf Budgets begrenzt wird (Finding 3).
- **README-Zitat.** Z. 100 bis 103 schreibt der README "Budgets pro Prozess senken" zu. Das steht dort nicht. Punkt 4 sagt nur "zusätzlich am Proxy begrenzen", Punkt 8 sagt "Budgets gelten pro Prozess". Es ist ein Vorschlag, den das Dokument als bestehenden Umgang ausgibt.
- **Cache-Begründung.** "Verändert nur die Zahl der Abfragen" (Z. 87) ist unvollständig, weil die Zahl der Abfragen genau das Budget verbraucht (README Z. 245 bis 246: Wiederholte Namen "zählen nicht"). Das Nicht-Ziel kann bestehen bleiben, aber die Begründung muss ehrlich sein: Komplexität und Datenschutz (Antworten im gemeinsamen Speicher), plus der Nachteil sinkender Trefferquote bei N Prozessen, der mit Sticky Routing (Option C) abzumildern wäre. Das sind zwei Sätze.

### 7. Major: Redis-Persistenz und die Datenschutzzusage sind der einzige Punkt aus Stufe 7, den auch ein kleiner Scope zwingend behandeln muss.
**Scope:** Z. 85, 143 bis 146 (Entscheidungstabelle und Datenschutz)

- Z. 85 verwirft "Redis von Anfang an" mit Verweis auf die Datenschutzzusage. Das Dokument kehrt das um, ohne die Tabelle abzugleichen. Redis schreibt standardmäßig Snapshots. Die README sagt an anderer Stelle "nichts wird auf die Platte geschrieben".
- Bei einem auf Budgets begrenzten Scope (Finding 3) enthält der Speicher keine personenbezogenen Daten, und der Widerspruch schrumpft auf eine Zeile in der Entscheidungstabelle ("durch Vorschlag berührt, gilt dann nicht mehr für Zähler ohne Personenbezug"). Ohne diese Einschränkung bleibt es ein offenes Datenschutzproblem.
- Die Spalte "Status" in der Entscheidungstabelle (Stufe 7, M10) ist hier eine günstige, berechtigte Korrektur.

### 8. Nit: Der Systemüberblick wiederholt `v2-spec.md`.
**Scope:** Z. 45 bis 75 (aus Stufe 5, Finding 12, weiterhin offen)

- Ampelregeln, Cache-Regeln und Quellenmodell stehen in `v2-spec.md`. Das Dokument erklärt selbst, dass dort die verbindliche Fassung steht. Für den Vorschlag reichen die berührten Bausteine (Wächter, HTTP-Client, Cache) plus ein Link. Das verkleinert das Dokument und senkt das Auseinanderlaufrisiko.
- Die Stufe-6-Findings 8, 9, 13 und 14 (`opendata-words`, "Quellenumfang", `similar`/`invalid`/`weak`, MCP ausschreiben, "Betreiber", 300 Sekunden) laufen in die Gegenrichtung. Sie würden den Überblick noch länger machen, um Begriffe zu erklären, die `v2-spec.md` bereits definiert. Besser ist es, den Überblick zu kürzen und auf die Spezifikation zu verlinken. Stufe 6 hat die Frage aus der Sicht eines Lesers gestellt, der nur dieses Dokument kennt; dieses Dokument erhebt aber ausdrücklich nicht den Anspruch, eigenständig zu sein (Z. 5 bis 6).

## Bewertung der Findings aus Stufe 6 und 7 für den Scope des Dokuments

Maßstab: Führt das Finding das Dokument näher an eine fokussierte Entscheidungsvorlage, oder bläht es das Dokument zu einem Umsetzungs- und Betriebskonzept auf?

### Berechtigt: das Dokument sollte diese Findings aufnehmen (gering im Umfang)

| Finding | Begründung |
|---|---|
| Stufe 7 B1 / Stufe 6 F1 (Plan gegen Empfehlung, Status) | Kern des Blockers; macht das Dokument kleiner |
| Stufe 7 B2 (Bedarf und Auslöser) | Ein Absatz; legt fest, wann B überhaupt auf den Tisch kommt. Beleg: ROADMAP-Auslöser |
| Stufe 7 M1 / Stufe 6 F6 (Fensterart, "exakt") | Behebbar durch einen Satz oder durch D |
| Stufe 7 M3 (Cache-Begründung) | Zwei Sätze; die bestehende Begründung ist sachlich falsch |
| Stufe 7 M4 (GitHub und Slots einordnen) | Als Restrisiko in einem Satz festhalten ("nicht gelöst, `GITHUB_TOKEN` bleibt das Mittel"). Nicht lösen. |
| Stufe 7 M6 (`MARKENFREI_GLOBAL_RATE_LIMIT` ändert Bedeutung) | Gilt nur, wenn das Systemlimit ins Ziel kommt; mit Scope-Begrenzung (Finding 3) entfällt es |
| Stufe 7 M7, nur der Teil "heutiger Umgang falsch zitiert" | Sachlicher Fehler, ein Satz |
| Stufe 7 M10 (Statusspalte in der Entscheidungstabelle) | Eine Spalte |
| Stufe 7 M12 (Aussage zu Registern) | Ein Wort: "geprüft" |
| Stufe 6 F2 (`HOST_BUDGET_SHARE` spezifizieren) | Nur berechtigt, weil D die Empfehlung ist |
| Stufe 6 F5 / Stufe 7 M8, Teil `kind` und Async | Nur bei B relevant; löst sich durch Injektion (Finding 5) |

### Teilweise berechtigt: nur in verkürzter Form

| Finding | Einwand |
|---|---|
| Stufe 7 M2 (Rückfall) | Die Logik "bei Ausfall gilt pro Prozess wieder das volle Budget, also N × 18" ist ein echtes Designproblem von B und gehört als Risiko in einen Satz. Offline-Queue, Backoff und Timeout-Herleitung sind Umsetzung. Die Frage fail-open gegen fail-closed ist bereits Offene Frage 3 und sollte entschieden oder offen bleiben, nicht beides. |
| Stufe 7 M5 (Betrieb und Datenschutz) | Persistenz (`save ""`), Personenbezug und Betreiber des Dienstes: ja. `maxmemory`, TLS, Rotation des Geheimnisses, Passwort in der URL: nur im B-Betriebsplan. |
| Stufe 7 M9 (Erfolgskriterien) | Die Einschränkung der Messung (Simulation mit 300 ms, README Punkt 8 selbst sagt "nicht mit echtem Verkehr getestet") sollte ehrlich stehen. Weitere Metriken für eine nicht beschlossene Funktion erzeugen Scheinpräzision. |
| Stufe 7 M13 / Stufe 6 F4, F10 (Begriffe) | Einheitliche Begriffe sind gut, aber nur durch Umbenennen im Text, nicht durch ein Glossar. Ein Glossar wäre mehr Text für ein Dokument, das kürzer werden sollte. |
| Stufe 7 M7, Teil "Alternativen ergänzen" | Siehe unten bei den nicht berechtigten Findings. |

### Nicht berechtigt für diesen Scope (Gegenposition)

| Finding | Begründung |
|---|---|
| Stufe 7 M7, neue Optionen (ein Prozess als Besitzer aller ausgehenden Abfragen, Node-Cluster, Proxy-Limit als eigene Option) und Alternativen zu Detailentscheidungen (festes gegen gleitendes Fenster, Redis gegen andere Speicher) | Das Dokument hat bereits vier Optionen. Mehr Optionen verlängern die Entscheidung, ohne sie zu verbessern. Detailalternativen gehören in die Umsetzung. Einzige Ausnahme: Das Proxy-Limit steht ohnehin in "Heutiger Umgang". |
| Stufe 7 M11 (neue Gliederung: H2 "Problemstellung", H3 "Architektur", Risikotabelle, Komponentendiagramm) | Eine Umordnung der Gliederung nach feature-spec-Muster ist Formalismus. Die Risiken sind im Dokument schon da. Ein eigener Risikoabschnitt für eine nicht beschlossene Funktion ist Aufwand ohne Entscheidungswert. Wenn das Dokument zum Entscheidungsdokument wird (Finding 1), ist die bestehende Struktur ausreichend. |
| Stufe 7 M9, Metriken (Round-Trips pro Prüfung, zusätzliche Latenz, "Antwortzeit bei Ausfall höchstens 8 s") | Das sind Abnahmekriterien eines Umsetzungsplans. Sie vorab zu fixieren ist Schein-Messbarkeit. |
| Stufe 7, Wartelogik mit Jitter und Thundering Herd | Implementierungsdetail einer Variante, die es noch nicht gibt. |
| Stufe 7, Nits zur Sprache ("gebauten" statt "implementierten", "tatsächlich" streichen, "fail-open" eindeutschen, Gliederung der Ziele als H3, Links statt Fließtext) | Kosmetik. Nicht schädlich, aber kein Beitrag zum Fokus. |
| Stufe 6 F3 (Entscheidungstabelle, Datenschutzzusage) | Berechtigt, aber bereits in Stufe 5, Finding 8 und Stufe 7 M10 enthalten (Duplikat). |
| Stufe 6 F7 (wer betreibt Redis, `docker-compose`, Zugriffsschutz) | Nur für B. Gehört in den B-Betriebsplan. |
| Stufe 6 F8 (`opendata-words` erklären), F9 ("Quellenumfang", "Einheiten"), F12, F13 (Erklärung von `similar`, `weak`, "3 je Prüfung", MCP ausschreiben), F14 ("Betreiber", "Grundsätze", 300 Sekunden) | Diese Fragen entstehen aus dem Anspruch, das Dokument müsse ohne Vorkenntnis lesbar sein. Das Dokument verweist aber für die Prüfungslogik auf `v2-spec.md`, und der Vorschlag betrifft nur die Zähler. Erklärungen für Begriffe außerhalb des Vorschlags zu ergänzen, bläht das Dokument auf. Einzige sinnvolle Ausnahme: ein Verweis, dass die Quelle der Wahrheit für Kosten und Budgets der Code ist. Der Hinweis auf `opendata-words` entfällt, wenn der Scope auf Budgets begrenzt wird, weil die Route dann gar nicht angefasst wird. |

## Entwicklung des Dokuments: Fokussierung oder Aufblähung?

- **Alle Findings umgesetzt (Stufen 5 bis 7):** Das Dokument wächst grob um das Anderthalbfache bis Doppelte. Neue Abschnitte wären Problemstellung, Risikotabelle, Betrieb und Datenschutz mit Redis-Konfiguration, Glossar, ein Absatz zu GitHub und Slots, Metriken, Statusspalte, erweiterte Alternativen und ein Messkonzept. Es wäre ein vollständiges B-Konzept für einen Bedarf, den ROADMAP und README nicht als eingetreten ausweisen. Das ist Scope-Aufblähung.
- **Nur die in diesem Bericht als berechtigt eingestuften Findings:** Das Dokument wird kürzer. Es besteht dann aus einem Bedarfsabsatz mit Auslöser, einem Lösungsraum mit Status und Entscheidung (A jetzt, D als nächste Stufe, B als Eskalation), einem knappen D-Konzept, einer ehrlichen Liste der Restrisiken (GitHub, Slots, Cache-Trefferquote, Persistenz) und einem bedingten B-Abschnitt auf Designebene (Injektion, Rückfallverhalten, Datenschutz). Der Systemüberblick schrumpft auf die berührten Bausteine. Das ist ein fokussiertes Dokument.

## Empfehlung an den Elephant

1. Zuerst entscheiden (Finding 1): Gibt es einen belegten Bedarf für mehr als einen Prozess? Wenn nein, wird das Dokument ein Entscheidungsdokument mit A als Beschluss, D als nächster Stufe und B als Eskalation. Der B-Plan ab Z. 156 wird gestrichen oder als "bedingt" gekennzeichnet.
2. Den Scope auf Zieldienst-Budgets begrenzen (Finding 3). Das Client-Limit bleibt am Proxy, bis eine Umgehung belegt ist.
3. D zu einem kurzen, spezifizierten Konzept machen (Finding 2).
4. Die sachlichen Fehler korrigieren (Finding 6): Fensterart, Testaussage, README-Zitat, Cache-Begründung. Dazu die Restrisiken GitHub und Slots ehrlich nennen.
5. Die Findings aus Stufe 6 und 7, die Umsetzungsdetails von B, die Gliederungsumbauten und die Begriffserklärungen außerhalb des Vorschlags (siehe Tabelle "Nicht berechtigt") vorerst nicht umsetzen. Sie in einen späteren B-Umsetzungsplan aufheben, falls B beschlossen wird.
