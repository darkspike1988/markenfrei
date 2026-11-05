# Zoom-Out-Review: `docs/design.md` (Zeilen 1 bis 260), Runde 2

Stufe 5 der wiederholten EGM-Review. Reviewer: `egm:egm-zoom-out`, ohne Kenntnis der ersten Runde. Bericht der ersten Runde: `review-round-1/zoom_out_report.md`. Geprüft gegen den Zoom-Out-Standard und gegen `src/lib/engine/http.ts`, `docker-compose.yml`, `README.md`, `ROADMAP.md`, `src/lib/README.md` und die vorhandenen Tests.

## Gesamturteil

**Bestanden mit Auflagen.** Kein Blocker. Kontext und Wurzelproblem sind klar. Die Behauptungen zu `takeBudget`, `HOST_BUDGETS`, `acquireSlot`, GitHub-Sperre (`packages.ts:347`), `processGuard`, `checkCost`, `tests/engine-budget.test.ts` und `docker-compose.yml` stimmen mit dem Code überein.

Das Dokument entscheidet ehrlich für Option A, weil der Bedarf nicht belegt ist. Es verfehlt aber seinen eigenen Maßstab, weil es trotzdem Option D bis zum Umsetzungsplan ausarbeitet und Option B vorplant.

## Findings

### 🟡 Major

**1. Z. 20, 98, 204 bis 260: Vollständiger Umsetzungsplan für Option D trotz unbelegtem Bedarf**
- Das Dokument sagt selbst, der Bedarf sei „nicht belegt“ (Z. 60) und ohne ein Ja zu Frage 1 werde der Plan „nicht begonnen“ (Z. 198). Es enthält trotzdem einen Plan mit drei Schritten, Abnahme, Testvektoren, Zeilenverweisen und vier Dokumentationsänderungen. Die Zusammenfassung nennt D „spezifiziert, wird gebaut“ (Z. 20).
- Das ist spekulativer Entwurf (YAGNI) und zugleich Altitude-Drop (Finding 5). Der Plan ist Ballast, bis Frage 1 mit „ja“ beantwortet ist, und veraltet mit jeder Änderung an `http.ts`.
- **Empfehlung:** Plan streichen oder in ein eigenes Dokument auslagern, das erst nach einem „ja“ entsteht. Hier genügt die Regel (Z. 104 bis 125). Status von D in der Zusammenfassung auf „skizziert, nicht beschlossen“ ändern; das beseitigt den Widerspruch zwischen Z. 20 („wird gebaut“) und Z. 198 („wird nicht begonnen“).

**2. Z. 71 bis 72 gegen Z. 106 bis 113: Der einzige genannte Anlass passt nicht zu D**
- Als möglicher Anlass wird ein Neustart ohne Ausfall genannt, bei dem kurz zwei Prozesse laufen.
- D teilt die Budgets dauerhaft durch `MARKENFREI_INSTANCES`. Wer die Variable für die kurze Überlappung auf 2 setzt, halbiert im Normalbetrieb Apple von 18 auf 9 pro Minute, ein Kapazitätsverlust von 50 % ohne Gegenwert. Wer sie nicht setzt, hat nur während der Überlappung kurz doppeltes Budget.
- Für diesen Anlass wäre D schlechter als gar keine Maßnahme. Frage 2 (Z. 200 bis 202) berührt das nur am Rande.
- **Empfehlung:** Passung von D zu den möglichen Anlässen ausdrücklich prüfen oder den Anlass Neustart aus der Begründung für D entfernen.

**3. Z. 20, 98, 204 bis 260: Die billigere Alternative fehlt**
- Die Lücke ist laut Dokument, dass „Budgets pro Prozess“ nicht als Betriebsgrenze dokumentiert sind (Z. 53 bis 56). Dafür genügt eine Dokumentationsänderung in README Punkt 8 und im Kommentar zu `HOST_BUDGETS`: „Mehrere Prozesse auf derselben IP werden nicht unterstützt; dann `HOST_BUDGETS` im Code anpassen.“ Null Code, eine Zeile.
- Das Dokument vergleicht A, B, C und D, aber nicht „A plus Dokumentation“ als kleinste Stufe. D führt eine Variable, zwei Funktionen, eine Option an `createHttpClient`, Tests und vier Dokumentationsänderungen ein. Es muss begründen, warum diese Stufe nicht reicht.

**4. Z. 157 bis 182: „Eskalation zu B“ legt Details für ein zurückgestelltes Feature fest**
- Sechs Festlegungen (Umfang, Einbindung, Zählverfahren, Persistenz, Ausfall, Bewertung) für etwas, das laut Z. 99 „zurückgestellt“ ist und laut Z. 159 erst bei messbarem Bedarf in Betracht kommt. Die Auslöser (Z. 159 bis 163) reichen als Eskalationsregel; die Festlegungen können beim Plan für B entstehen.
- „Ausfall“ koppelt B an D (Z. 177) schon vor einer Entscheidung für B.
- **Empfehlung:** Auf die Auslöser und höchstens eine Zeile mit Randbedingungen (keine IP im Speicher, keine Persistenz) kürzen.

**5. Z. 210 bis 252: Zu niedrige Flughöhe im Plan**
- Funktionsnamen (`parseInstances`, `shareBudget`, `INSTANCES`), umgeschriebene Quelltextzeilen (Z. 218 bis 221), Zeilennummern im Code und exakte Testwerte (zum Beispiel `{1, 63334}`): Pseudo-Implementierung statt Architektur, Schnittstellen und Datenfluss.
- Die Zeilenverweise stimmen schon jetzt nicht ganz: Der Kommentar zu `HOST_BUDGETS` steht in `http.ts` Z. 19 bis 23, nicht „20 bis 24“.
- **Empfehlung:** Die Schnittstelle genügt: „`createHttpClient` teilt jedes Budget durch die Prozesszahl; Standard 1 ändert nichts.“

**6. Z. 142 bis 144: Die Folge für crates.io wird untertrieben, und crates.io ist eine Standardquelle**
- Das Dokument sagt, eine Shortlist treffe bei crates.io „häufiger“ auf `budget`. Nach `http.ts` Z. 264 bis 276 gilt: Mit N = 2 ist das Fenster 2000 ms, `MAX_BUDGET_WAIT_MS` ist 1500 ms. Die zweite gleichzeitige crates-Anfrage eines Prozesses bekommt kein Budget und liefert `unknown`.
- Die Namen einer Shortlist laufen parallel. Schon bei zwei Namen ist die crates-Zeile des zweiten Namens `unknown`, und die Ampel wird nie Grün. Bei N = 1 gilt das erst ab dem dritten Namen (Z. 144 sagt das richtig). Mit D rutscht die Grenze auf den zweiten Namen: ein Funktionsverlust der Standardprüfung, kein Randfall.
- **Empfehlung:** Die Folge offen aussprechen. Alternativen: `MAX_BUDGET_WAIT_MS` mitskalieren oder crates.io aus der Teilung nehmen. Das gehört in die Entscheidung über D, nicht erst in die Umsetzung.

**7. Z. 53 gegen Z. 49 und 150: Widerspruch bei der „einzigen Lücke“**
- Z. 53: „Das Abfragebudget ist die einzige Lücke, die der Proxy nicht schließt.“ Z. 49 führt bei den Slots als Schutz „niemand“, Z. 150 führt Slots als Restrisiko von D, die GitHub-Sperre (Z. 51) ist nur über `GITHUB_TOKEN` gemildert.
- Die Aussage muss lauten „die einzige Lücke, die D schließt“ oder „die schwerwiegendste“. Sonst begründet sie die Wahl von D mit einer falschen Prämisse (Z. 98: „schließt die einzige offene Lücke“).

### 🟢 Nit

**8. Z. 184 bis 193: Die Tabelle „Entscheidungen“ wiederholt Bestand.** Vier von sechs Zeilen (Engine, Ampel, Marke, Cache) stehen schon in `v2-spec.md`, `README.md` und `ROADMAP.md` und haben mit mehreren Prozessen nichts zu tun. Nur „Zustand im Arbeitsspeicher“ und „Abfragebudget je Zieldienst“ gehören hierher.

**9. Z. 17 bis 22, 95 bis 100, 184 bis 193: Die Optionen stehen dreimal als Tabelle.** Eine genügt. Die Reihenfolge A, D, B, C wirkt angeflanscht.

**10. Z. 50, 100, 155: Option C und die Cache-Trefferquote.** Der Cache ist nach Namen geschlüsselt, nicht nach Client. Sticky Routing hilft nur, wenn derselbe Client Namen wiederholt; verschiedene Clients mit demselben Namen bleiben bei 1 / N. „Mildert“ stimmt, „hebt“ (Z. 100) übertreibt. Option C ist Proxy-Konfiguration ohne Plan und lässt sich auf einen Satz kürzen.

**11. Z. 129 bis 130: „unter max“ ist ungenau.** Es muss „höchstens max“ heißen (`floor(max / N) × N ≤ max`, bei 18 mit N = 2 oder 3 mit Gleichheit). Bei ungeraden Teilern bleibt ein Rest ungenutzt (18 bei N = 7 ergibt 14, 22 % Verschnitt); das Dokument nennt Verschnitt nur bei ungleicher Last (Z. 140).

**12. Z. 118 bis 125: Hugging Face mit Token fehlt.** `huggingfaceBudget` liefert mit `HF_TOKEN` 900 statt 450 (`http.ts` Z. 39 bis 41); die Tabelle nennt nur „anonym“.

**13. Z. 215 bis 216 und 169 bis 171: Inkonsistente Konfigurationsgrenze.** D liest `process.env.MARKENFREI_INSTANCES` im Engine-Modul `http.ts`; für B legt das Dokument fest: „Die Engine liest keine Umgebungsvariable dafür.“ Entweder die Abweichung benennen (Vorbild `HF_TOKEN`, `http.ts` Z. 44) oder einheitlich gestalten. Das Muster `huggingfaceBudget(process.env.HF_TOKEN)` würde auch erlauben, `HOST_BUDGETS` beim Laden aus der Prozesszahl zu bilden und die neue Option `instances` an `createHttpClient` samt Änderung an `run` zu sparen.

**14. Z. 225 und 257: Bestehende Tests hängen an der Umgebung.** „Unverändert, weil der Standardwert 1 gilt“ stimmt nur, solange `MARKENFREI_INSTANCES` im Test-Prozess nicht gesetzt ist; die Tests in `tests/engine-budget.test.ts` übergeben Budgets (zum Beispiel Z. 45) und wären mit `MARKENFREI_INSTANCES=2` betroffen. Ein Satz zur Isolation genügt.

**15. Z. 247 bis 249: Verweis auf README Punkt 4.** Punkt 4 (Z. 220 bis 221) spricht von „Rate-Limit und Cache“ pro Prozess, nicht von Budgets. Nur Punkt 8 (Z. 248 bis 249) nennt Budgets.

**16. Z. 3 und 81 bis 82: Prozessvermerk und Ziel 3.** „überarbeitet nach der EGM-Review“ gehört nicht in ein Dauerdokument. Ziel 3 („keine personenbezogene Angabe in einen gemeinsamen Speicher“) betrifft nur B; A und D haben keinen gemeinsamen Speicher.

## Positiv

- Das Dokument wählt konsequent das Einfachste (A) und begründet das mit dem fehlenden Bedarf.
- Es ist ehrlich zu den Grenzen der Zahlen (Z. 65 bis 67: Simulation, kein echter Verkehr).
- Die Nicht-Ziele (Z. 83 bis 91) sind klar und senken die Komplexität.
- D ist als kleinster Eingriff angelegt und passt zum vorhandenen Muster aus `hostBudgets` und `huggingfaceBudget`; `takeBudget` bleibt unverändert.

## Empfohlene Kürzung

Behalten: „Zusammenfassung“, „Problem und Bedarf“, „Ziele und Nicht-Ziele“ und „Optionen“ mit der Regel aus D (Z. 104 bis 125), den Garantien und Folgen, dazu die offenen Fragen und den Status „A gilt“. Zusätzlich „A plus Dokumentation“ als kleinste Stufe prüfen.

Verschieben oder streichen: „Eskalation zu B“ (außer den Auslösern), die Entscheidungstabelle (außer den zwei relevanten Zeilen) und den „Detailed Implementation Plan“ (Z. 204 bis 260).
