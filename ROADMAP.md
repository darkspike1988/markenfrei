# Roadmap

Stand: 4. November 2026. Markenfrei ist ein kleines Online-Tool: ein Name rein, nach
etwa einer Sekunde eine Ampel mit den Gründen (gemessen mit drei Endungen). Ohne KI, ohne Konto, ohne Tracking.
Wer ein LLM nutzt, spricht Markenfrei über den [MCP-Server](README.md) an.

**Legende:** ✅ gebaut und geprüft · 🔗 nur Link, keine Abfrage · 🟡 in Arbeit oder
Entscheidung offen · ⬜ geplant

---

## Der Schnellcheck auf einen Blick

| Frage | Antwort heute | Ziel |
|---|---|---|
| Ist der Name frei? | ✅ Ampel (grün, gelb, rot) und Domain-Chips pro Endung | unverändert |
| Warum diese Farbe? | ✅ wichtigstes Signal in der Zeile, alle im Detail | 🟡 die drei wichtigsten Gründe in der Zeile |
| Wo ist der Konflikt? | 🟡 erst im Detailfenster sichtbar | ⬜ vier Punkte pro Zeile: Domain · Marke · App Store · Pakete |
| Ist die Prüfung vollständig? | ✅ Hinweis „unvollständig“, Score bleibt unter 80 | unverändert |
| Kann ich das Ergebnis teilen? | ✅ Link (`?q=`) und Markdown-Export | ⬜ JSON-Export mit demselben Schema wie MCP |

---

## Was heute geprüft wird

| Bereich | Quellen | Status |
|---|---|---|
| Domains | RDAP: DENIC, Verisign, Google Registry, Identity Digital, NIC.fr, Nominet, KRNIC; DNS-over-HTTPS als Fallback | ✅ (DoH-Fallback bisher nicht getestet) |
| App Stores | Apple iTunes (Suche und Bundle-ID), Google Play | ✅ |
| Pakete und Handles | GitHub, npm, PyPI, crates.io, Homebrew, Go-Proxy | ✅ (GitHub ohne Token knapp limitiert) |
| Bekannte Namen | Wikidata, Wikipedia, DuckDuckGo | ✅ |
| Phonetik und Schutzfähigkeit | Kölner Phonetik, Liste von 89 bekannten Marken, Freihaltebedürfnis (§ 8 MarkenG) als Heuristik | ✅ Heuristik, keine Registerauskunft |
| **Markenregister** | DPMA, EUIPO, TMview, WIPO, USPTO | 🔗 nur Links zur manuellen Recherche |
| Namensideen | OpenThesaurus, Datamuse, feste Wortbausteine | ✅ |
| MCP für LLMs | stdio und HTTP, fünf Tools | ✅ (zwei getrennte Implementierungen) |

**Wichtig:** Eine grüne Ampel heißt „keine Konflikte in Domains, App Stores, Paketen und
den bekannten Quellen“. Sie heißt nicht „als Marke frei“. Das Markenregister muss man
weiterhin selbst prüfen. Das Tool ist eine Vorprüfung, keine Rechtsberatung.

---

## Jetzt: Betrieb und Vertrauen

Ziel: Das Tool bleibt öffentlich nutzbar, ohne dass es durch Last oder Missbrauch
ausfällt, und verspricht nicht mehr, als es kann.

| Status | Aufgabe | Warum |
|---|---|---|
| ⬜ | Rate-Limit pro IP, höchstens 8 Endungen pro Anfrage mit Allowlist | Jede Prüfung löst je nach Endungen etwa 20 bis 30 Abfragen bei Dritten aus. Ohne Limit lässt sich das Tool zum Hämmern dieser Dienste nutzen. |
| ⬜ | Tests für Scoring, Phonetik und die Zuordnung der RDAP-Server | Es gibt keine Tests. Die Fehler bei `.fr`, `.uk` und `.kr` wären so aufgefallen. |
| ⬜ | Eine MCP-Implementierung (SDK, Streamable HTTP) mit strukturierten Antworten | Heute pflegen `mcp/server.ts` und `api/mcp/route.ts` dasselbe doppelt, die HTTP-Variante kann das Protokoll nur teilweise. |
| ⬜ | GitHub: optionales Token, kurzes Caching der Antworten | Ohne Token sind es 10 Suchanfragen pro Minute. Eine Ideen-Generierung reißt das Limit. |
| ⬜ | Preistabelle mit Datum je Zeile | Die Preise sind fest eingetragen und veralten. |
| 🟡 | Name und Claim prüfen („Markenfrei“, „Ein Name, der dir niemand streitig macht“) | Solange kein Register abgefragt wird, verspricht der Text mehr als das Tool prüft. |

---

## Als Nächstes: Schnellcheck und Markenrecht

| Status | Aufgabe | Ergebnis für Nutzer |
|---|---|---|
| ⬜ | Vier-Punkte-Zeile: Domain · Marke · App Store · Pakete mit je einem Ampelpunkt | Konflikt und Ort in einem Blick, ohne das Detailfenster zu öffnen |
| ⬜ | „Warum gelb?“ mit den drei wichtigsten Gründen direkt in der Zeile | Entscheidung ohne Klick |
| 🟡 | Markenregister klären: Welche Schnittstellen sind ohne Schlüssel nutzbar, welche brauchen Registrierung? Ergebnis dokumentieren, dann entscheiden | Echte Registerauskunft statt nur Links, falls machbar |
| ⬜ | `.fr`, `.uk`, `.kr` in der Oberfläche anbieten (die API kann sie bereits) | Mehr Endungen im Schnellcheck |
| ⬜ | JSON-Export im selben Schema wie die MCP-Antwort | Ergebnis lässt sich weiterverarbeiten |

---

## Später

| Status | Idee | Voraussetzung |
|---|---|---|
| ⬜ | Quellenstand im Ergebnis speichern (Zeitpunkt, Status je Quelle), Beispiele auf der Startseite reproduzierbar machen | Schema des Berichts festlegen |
| ⬜ | Liste prüfen (mehrere Namen einfügen, eine Tabelle zurück) | Rate-Limit und Caching stehen |
| ⬜ | Weitere Registries aufnehmen | Eintrag im IANA-Bootstrap und ein Test mit bekanntem und freiem Namen |
| ⬜ | Einbettbare Ampel für eigene Seiten | stabiles JSON-Schema |

---

## Nicht geplant

- **Kein LLM im Produkt.** Namen und Urteil entstehen aus festen Regeln und offenen
  Daten. LLMs nutzen Markenfrei von außen über MCP.
- **Keine Konten, kein Tracking, keine Speicherung von Suchanfragen.**
- **Keine Rechtsberatung.** Das Tool ersetzt weder die Recherche beim Markenamt noch
  eine anwaltliche Prüfung.

---

## Mitmachen

Fehlerberichte und Ideen gern als Issue. Wie man lokal startet und beiträgt, steht in
[CONTRIBUTING.md](CONTRIBUTING.md).
