---
status: freigegeben
datum: 2026-11-28
---

# 0069 — Agent 2: Fokusansicht, Suchen ohne Agent, alles bearbeitbar

**Quelle:** Review 0003 nach v2026.11.4 (`tmp/__REVEWS/0003/REVIEW.md`, Bilder 1–10 im selben Ordner).
Baut auf Spec 0066, 0067 und 0068. **Kritischer Pfad:** ja: Schreiben über den Agent (alle Felder), Daten in
Exporten.

## Ziel

Der AI Agent fühlt sich am Handy an wie Gemini oder ChatGPT: eine ruhige Vollbild-Ansicht, ein großzügiges
Eingabefeld, kein Standort-Gefrage. Websuchen gehen ohne Wartezeit auf das Modell, alles lässt sich über den Agent
ändern, und was im Chat steht, lässt sich kopieren, exportieren und teilen.

## Nicht-Ziele

- Kein öffentlicher Link auf einen Chat (Teilen nur über das Teilen-Menü des Geräts).
- Kein automatisches Auslesen des Gerätestandorts mehr.
- Kein Umbau von „Essen“ zu „Erleben“ (eigene Spec).
- Kein neuer Suchanbieter: die Suchen nutzen die vorhandene Websuche (Serper) der App.

## Anforderungen

### Ansicht und Eingabe

**REQ-001 — Fokusansicht am Handy.** Am Handy öffnet der Agent wie der Einkaufsmodus ohne Tab-Leiste, mit ✕ oben
rechts (zurück, woher man kam). Desktop bleibt wie heute. Offline: lesend (Verlauf).

- AC-001: Angenommen Handy · Wenn Enrico den AI Agent öffnet · Dann ist keine Tab-Leiste zu sehen und ✕ führt zur
  vorigen Seite
- AC-002: Angenommen Ansicht „AI First“ · Wenn Enrico den Agent-Tab antippt · Dann öffnet die Fokusansicht, ✕ führt
  zur Übersicht

**REQ-002 — Eingabe wie Gemini.** Ein schwebendes, abgerundetes Feld ohne eigenen Kasten, standardmäßig 3 Zeilen
hoch, wächst bis 5; unter der letzten Nachricht freier Raum (nur unter der letzten). Nach dem Senden schließt am Handy
die Tastatur, am Desktop bleibt der Fokus im Feld.

- AC-003: Angenommen leeres Feld · Wenn der Chat öffnet · Dann ist das Feld 3 Zeilen hoch
- AC-004: Angenommen Desktop · Wenn Enrico sendet · Dann steht der Cursor sofort wieder im Feld

**REQ-003 — Ort nur von Hand.** Kein Gerätestandort. Der Ort-Chip zeigt den zuletzt gesetzten Ort (lokal gespeichert)
oder „Ort wählen“; er erscheint nur mit dem Badge „Ausgehen“. Braucht eine Frage einen Ort und keiner ist gesetzt,
fragt der Agent nach. Entfernt man alle Badges, verschwindet der Chip.

- AC-005: Angenommen kein Ort gesetzt · Wenn Enrico „Italiener in der Nähe“ fragt · Dann fragt der Agent nach dem
  Ort, ohne Standortabfrage des Browsers
- AC-006: Angenommen Ort „Mitte“ gesetzt · Wenn die App neu startet · Dann steht der Chip wieder auf „Mitte“

**REQ-004 — Navigation in drei Varianten.** Einstellungen → Ansicht: „Standard“, „AI First 1“ (Agent in der Mitte,
Haushalt unter ⊞), „AI First 2“ (Agent in der Mitte, Liste unter ⊞). Das ✨ in den Köpfen von Restaurants und
Aktivitäten entfällt (doppelter Einstieg).

- AC-007: Angenommen „AI First 2“ · Wenn Enrico die App öffnet · Dann zeigt die Leiste Übersicht · Essen · AI Agent ·
  Kalender · Haushalt

### Suchen ohne Agent

**REQ-005 — /rezept-suche, /restaurant-suche, /aktivität-suche.** Überall, wo es heute eine Websuche gibt, gibt es
ein Slash-Kommando. Danach tippt man den Suchbegriff (Titel), Enter startet die vorhandene Suche der App – ohne
Modelllauf. Die Treffer erscheinen im Chat wie in der heutigen Websuche, mit Öffnen und Anlegen. Der Agent bekommt
nur eine Notiz (gesucht, gefunden, angelegt), damit spätere Fragen darauf Bezug nehmen können. Offline: nur online.

- AC-008: Angenommen „/rezept-suche Lasagne“ · Wenn Enrico Enter drückt · Dann erscheinen Rezept-Treffer in unter
  3 s und kein Agent-Lauf wird gezählt
- AC-009: Angenommen ein Treffer wurde angelegt · Wenn Enrico danach „mach daraus eine vegane Variante“ schreibt ·
  Dann weiß der Agent, welches Rezept gemeint ist

### Bearbeiten

**REQ-006 — Alles bearbeitbar.** Vorschläge des Agents können jedes Feld ändern, das man auch von Hand ändern kann:
Rezept (alle Felder, Varianten, Zutaten, Schritte, Schlagworte), Restaurant, Aktivität (inkl. Art, Adresse, Website),
Termin, Artikel, Dauerposten, Aufgabe – über die vorhandenen Schreibwege, mit Rückgängig.

- AC-010: Angenommen 4 Aktivitäten ohne Art · Wenn Enrico „ordne allen ohne Art eine zu“ schreibt · Dann zeigt eine
  Sammelkarte je Aktivität die vorgeschlagene Art und „4 übernehmen“ setzt sie

### Chat

**REQ-007 — Kopieren, Export, Teilen.** Jede Nachricht (eigene und Agent) hat „Kopieren“. Der ganze Chat lässt sich
als Markdown in die Zwischenablage kopieren oder über das Teilen-Menü des Geräts teilen (Text oder `.md`-Datei).

- AC-011: Angenommen ein Chat mit 6 Nachrichten · Wenn Enrico „Als Markdown kopieren“ wählt · Dann liegt der Chat mit
  Überschriften je Nachricht in der Zwischenablage

**REQ-008 — Vollständige Listen.** Fragt man nach „allen“, zeigt die Galerie alle Treffer (mit „Mehr zeigen“ in der
Karte), ohne dass man nachfragen muss; gleiche Abfragen stehen nur einmal in den Schritten.

- AC-012: Angenommen 17 Aktivitäten ohne Art · Wenn Enrico nach allen fragt · Dann sind alle 17 über die Karte
  erreichbar und jede Abfrage steht einmal in den Schritten

### Fehler

**REQ-009 — Behobene Fehler.**

- AC-013: Angenommen mehrere Bilder wurden nacheinander gewählt · Wenn Enrico „Als Foto nehmen“ tippt · Dann wird das
  zuletzt gewählte Bild übernommen (heute bleibt der Knopf gesperrt, Bilder 1–4)
- AC-014: Angenommen am Handy wurde ein Rezept mit Foto angelegt · Wenn Enrico „Öffnen“ tippt · Dann lässt sich die
  Rezeptseite scrollen, auch nach Neuladen

## Entscheidungen

1. Fokusansicht nur am Handy; Desktop behält Seitenleiste und Spalten.
2. Standort: kein Auslesen mehr (ersetzt Spec 0066 REQ zum Gerätestandort und 0067 Entscheidung 33).
3. Teilen ohne öffentlichen Link (Daten des Haushalts).
4. Suchen ohne Agent nutzen die vorhandenen Abläufe von Spec 0049/0062 (Websuche, Treffer, Übernehmen).
5. „Alle Textfeld-Öffnungen smooth“ (Review Z. 15): kein bekannter Fehler; beim Durchklicken im Verlauf prüfen.

## Risiken

| Risiko                                       | Gegenmaßnahme                                            | Test                           |
| -------------------------------------------- | -------------------------------------------------------- | ------------------------------ |
| Agent ändert Felder fremder Haushalte        | gleiche Schreibwege mit JWT/RLS wie heute                | Function-Test fremder Haushalt |
| Eingeschleuste Anweisung ändert viele Felder | nur Vorschläge, Übernehmen in der App, Löschen einzeln   | Testkatalog 0067 erweitert     |
| Export enthält Haushaltsdaten                | nur lokal (Zwischenablage/Teilen-Menü), kein Server-Link | –                              |

## Umsetzung

- [ ] 1. Fokusansicht am Handy, ✕ (AC-001, AC-002)
- [ ] 2. Eingabe wie Gemini, 3 Zeilen, Abstand, Fokus nach Senden (AC-003, AC-004)
- [ ] 3. Ort nur von Hand, lokal gemerkt, Agent fragt (AC-005, AC-006)
- [ ] 4. Navigation Standard / AI First 1 / AI First 2, ✨ in Restaurants/Aktivitäten entfernen (AC-007)
- [ ] 5. Slash-Suchen ohne Agent mit Notiz an den Agent (AC-008, AC-009)
- [ ] 6. Alle Felder als Vorschlag änderbar (AC-010)
- [ ] 7. Kopieren, Markdown-Export, Teilen (AC-011)
- [ ] 8. Vollständige Listen, keine doppelten Abfragen (AC-012)
- [ ] 9. Fehler Foto-Auswahl und Scrollen (AC-013, AC-014)
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün; Testkatalog 0067 mit neuen Fällen;
      e2e und Security-Check vor dem Release
