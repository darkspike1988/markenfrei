# Roadmap

Stand: 4. November 2026. Markenfrei ist ein kleines Online-Tool: ein Name rein, nach
etwa einer Sekunde eine Ampel mit den Gründen (gemessen mit drei Endungen). Ohne KI, ohne
Konto, ohne Tracking. Wer ein LLM nutzt, spricht Markenfrei über den
[MCP-Server](README.md) an.

**Legende:** ✅ gebaut und geprüft · 🔗 nur Link, keine Abfrage · 🟡 Entscheidung offen ·
⬜ geplant

---

## Der Schnellcheck auf einen Blick

| Frage | Antwort heute |
|---|---|
| Ist der Name frei? | ✅ Ampel (grün, gelb, rot) und Domain-Chips pro Endung |
| Wo ist der Konflikt? | ✅ vier Punkte pro Zeile: Domain · Marke · App Store · Pakete |
| Warum diese Farbe? | ✅ die drei wichtigsten Gründe direkt in der Zeile |
| Ist die Prüfung vollständig? | ✅ Hinweis "unvollständig", der Score bleibt dann unter 80 |
| Kann ich das Ergebnis weiterverwenden? | ✅ Link (`?q=`), Markdown-Export, JSON-Export im selben Schema wie MCP |

---

## Was geprüft wird

| Bereich | Quellen | Status |
|---|---|---|
| Domains | RDAP: DENIC, Verisign, Google Registry, Identity Digital, NIC.fr, Nominet, KRNIC (zehn Endungen); DNS-over-HTTPS als Fallback | ✅ (DoH-Fallback nicht getestet) |
| App Stores | Apple iTunes (Suche und Bundle-ID), Google Play | ✅ |
| Pakete und Handles | GitHub, npm, PyPI, crates.io, Homebrew, Go-Proxy | ✅ (GitHub ohne Token knapp limitiert) |
| Bekannte Namen | Wikidata, Wikipedia, DuckDuckGo | ✅ |
| Phonetik und Schutzfähigkeit | Kölner Phonetik, 89 bekannte Marken, Freihaltebedürfnis (§ 8 MarkenG) als Heuristik | ✅ Heuristik, keine Registerauskunft |
| **Markenregister** | DPMA, EUIPO, TMview, WIPO, USPTO, TMDB | 🔗 nur Links zur manuellen Recherche |
| Namensideen | OpenThesaurus, Datamuse, feste Wortbausteine | ✅ |
| MCP für LLMs | stdio und HTTP aus einem Server, fünf Tools | ✅ |

**Wichtig:** Eine grüne Ampel heißt "keine Konflikte in Domains, App Stores, Paketen und den
bekannten Quellen". Sie heißt nicht "als Marke frei". Warum kein Register live abgefragt
wird, steht in [docs/trademark-registers.md](docs/trademark-registers.md). Das Tool ist eine
Vorprüfung, keine Rechtsberatung.

---

## Erledigt in v1

| Bereich | Ergebnis |
|---|---|
| Eingabe | Umlaute werden ausgeschrieben (`Müller` wird `mueller`), ungültige Namen und Endungen bekommen eine klare Meldung (400) |
| Betrieb | Rate-Limit pro IP (Standard 60 pro Minute), Cache für eindeutige Antworten, höchstens 8 Endungen pro Anfrage |
| Qualität | 54 Offline-Tests, CI führt sie vor dem Build aus |
| MCP | ein Server für stdio und HTTP, Antworten im Schema `PublicReport` (`structuredContent`) |
| Oberfläche | Vier-Punkte-Zeile, drei Gründe, alle zehn Endungen, JSON-Export, Preisstand sichtbar |
| Ehrlichkeit | Texte sagen, was geprüft wird und was nicht; Score und Ampel passen zusammen |

---

## Offen und braucht eine Entscheidung

| Status | Thema | Frage |
|---|---|---|
| 🟡 | Name und Anspruch | "Markenfrei" verspricht mehr als die Vorprüfung leistet. Der Name ist unverändert, die Überschrift nicht mehr. Soll der Name bleiben? |
| 🟡 | Echte Registerabfrage | EUIPO (kostenlose Registrierung, Sandbox) und USPTO (API-Schlüssel) wären die einzigen Wege. Als optionale Quelle möglich, nur aktiv mit eigenem Schlüssel des Betreibers. Voraussetzung: Nutzungsbedingungen lesen und Antworten gegen bekannte Marken testen. |
| 🟡 | GitHub-Token | Ein kostenloses Token beim Betreiber hebt das Limit von 60 auf 5.000 Anfragen pro Stunde. Kein Nachteil, aber ein Geheimnis in der Server-Umgebung. |

---

## Später

| Status | Idee | Voraussetzung |
|---|---|---|
| ⬜ | Preise live oder je Zeile datiert statt einem festen Stand | Quelle mit stabiler Schnittstelle oder Pflegeprozess |
| ⬜ | Quellenstand im Ergebnis speichern, Beispiele auf der Startseite reproduzierbar machen | Entscheidung über Speicherung |
| ⬜ | Liste prüfen (mehrere Namen, eine Tabelle zurück) | Rate-Limit und Cache stehen (✅) |
| ⬜ | Weitere Registries aufnehmen | Eintrag im IANA-Bootstrap und ein Test mit bekanntem und freiem Namen |
| ⬜ | Einbettbare Ampel für eigene Seiten | stabiles JSON-Schema (✅) |
| ⬜ | Rate-Limit über mehrere Instanzen (gemeinsamer Speicher) | Betrieb mit mehr als einer Instanz |

---

## Nicht geplant

- **Kein LLM im Produkt.** Namen und Urteil entstehen aus festen Regeln und offenen Daten.
  LLMs nutzen Markenfrei von außen über MCP.
- **Keine Konten, kein Tracking, keine Speicherung von Suchanfragen.**
- **Keine Umgehung von Bot-Abwehr** und kein automatisiertes Abfragen von Diensten, die das
  nicht anbieten (zum Beispiel TMDB).
- **Keine Rechtsberatung.**

---

## Mitmachen

Fehlerberichte und Ideen gern als Issue. Wie man lokal startet und beiträgt, steht in
[CONTRIBUTING.md](CONTRIBUTING.md).
