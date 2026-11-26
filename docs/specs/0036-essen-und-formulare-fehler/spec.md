---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0036 — Essen und Formulare: Fehler und Bedienung

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
E-02, E-03, E-06, E-07 (Fehler), E-08, E-10, E-13, E-17 (Küche, Raster), F-02, F-07, F-08, B-02,
S-01). **Welle 1.** **Kritischer Pfad:** ja: Löschen (Bestätigung vor Löschaktionen).

## Ziel

Die kleinen Ärgernisse rund um Rezepte, Restaurants und Formulare sind weg: „Neu mischen“ mischt,
die Sortierung bleibt nach dem Neustart, Schlagworte und Küche lassen sich ohne Absetzen eingeben,
„Schinken“ lässt sich anlegen, nichts wird ohne Nachfrage gelöscht, und „Route“ erscheint nur mit
Karten-Link. Fotos lassen sich direkt unter dem Bild ändern und im Vollbild ansehen.

## Nicht-Ziele

- Kein neuer Bearbeitungsmodus der Rezeptseite (Spec 0037); hier nur der Fehler, dass „+ Zutat“
  fehlt.
- Kein neues Foto-Fenster (Spec 0039); „Foto ändern“ nutzt den heutigen Weg.
- Kein Schlagwort-Filter (Spec 0037).

## Anforderungen

Haushalt „Enrico & Nadja“, heute ist Donnerstag, 26.11.2026.

### Listen

**REQ-001 — „Neu mischen“ mischt.** Bei Sortierung „Zufall“ ordnet „Neu mischen“ die Liste neu, bei
Rezepten und Restaurants. Quelle: E-03. Offline: offline vollständig.

- AC-001: Angenommen 178 Rezepte, Sortierung „Zufall“, erstes Rezept „Griechischer Salat“ · Wenn ich
  „Neu mischen“ tippe · Dann ändert sich die Reihenfolge der ersten zehn Rezepte
- AC-002: Angenommen Suche „Nudeln“ ist aktiv · Dann ist „Neu mischen“ ausgeblendet (die Suche sortiert
  nach Treffer)

**REQ-002 — Sortierung bleibt.** Die gewählte Sortierart je Bereich (Rezepte, Restaurants,
Aktivitäten) wird auf dem Gerät gespeichert und gilt nach einem Neustart; Filter und Suche nicht.
Quelle: E-02. Offline: offline vollständig.

- AC-003: Angenommen ich wähle bei Rezepten „A–Z“ und bei Restaurants „Bewertung“ · Wenn ich die App
  neu starte · Dann sind „A–Z“ und „Bewertung“ gewählt, Filter „vegetarisch“ ist zurückgesetzt
- AC-004: Angenommen ein Link mit `sortierung=neu` wird geöffnet · Dann gilt der Link, und der
  gespeicherte Wert ändert sich nicht

**REQ-003 — Filter „Küche“ als Raster.** Die Chips eines Filterabschnitts brechen innerhalb des
Filterfelds um. Quelle: E-17. Offline: offline vollständig.

- AC-005: Angenommen Desktop 1400 px, Restaurants mit 13 Küchen · Wenn ich „Filter“ öffne · Dann
  stehen alle Küchen-Chips innerhalb des Filterfelds, „Vietnamesisch 1“ in der zweiten Zeile

### Eingabe

**REQ-004 — Schlagworte und Küche ohne Absetzen.** Nach Übernahme eines Vorschlags bleibt der Cursor
im Feld; Enter übernimmt einen exakt gleichen Vorschlag, sonst legt es den Wert neu an. Die Küche eines
Restaurants schlägt beim Tippen die Küchen des Haushalts vor. Quelle: F-02, E-17. Offline: offline
vollständig (Formular; Speichern online).

- AC-006: Angenommen Restaurant bearbeiten, Schlagworte · Wenn ich „Fam“ tippe und „Familie“ übernehme
  · Dann ist „Familie“ gesetzt, das Feld leer und der Cursor darin
- AC-007: Angenommen es gibt das Schlagwort „Ofen“ · Wenn ich „ofen“ tippe und Enter drücke · Dann
  ist „Ofen“ gesetzt (kein zweites „ofen“)
- AC-008: Angenommen „Grillen“ gibt es nicht · Wenn ich „Grillen“ tippe und Enter drücke · Dann ist
  „Grillen“ neu gesetzt
- AC-009: Angenommen Restaurants mit Küche „Vietnamesisch“ · Wenn ich in „Küche“ „Viet“ tippe ·
  Dann wird „Vietnamesisch“ vorgeschlagen

**REQ-005 — „Schinken“ trotz ähnlichem Artikel anlegen.** Ist der gesuchte Name nur Synonym eines
anderen Artikels, bietet die Suche zusätzlich „„Schinken“ neu anlegen“ an. Quelle: E-06. Offline:
offline lesend.

- AC-010: Angenommen Artikel „Kochschinken“ mit Synonym „Schinken“ · Wenn ich bei „Neue Zutat“
  „Schinken“ suche · Dann sehe ich „Kochschinken (auch: Schinken)“ und „„Schinken“ neu anlegen“
- AC-011: Angenommen ich lege „Schinken“ an · Dann gibt es den Artikel „Schinken“, und eine spätere
  Suche nach „Schinken“ zeigt ihn an erster Stelle
- AC-012: Angenommen es gibt schon den Artikel „Schinken“ · Wenn ich „schinken“ suche · Dann gibt es
  kein „neu anlegen“

**REQ-006 — Einheiten erklärt.** Neben jedem Mengenfeld mit freier Einheit erklärt ein (i), welche
Einheiten die App versteht. Quelle: E-13. Offline: offline vollständig.

- AC-013: Angenommen „Neue Zutat“ · Wenn ich auf (i) neben „Menge“ tippe · Dann sehe ich z. B. „g,
  kg, ml, l, EL, TL, Prise, Stück, Bund, Dose …“ mit Beispiel „400 ml“

### Rezepte und Restaurants

**REQ-007 — „+ Zutat“ immer da.** Auf der Rezeptseite steht „+ Zutat“ auch ohne Zutaten und im
Lesemodus; Tippen öffnet direkt „Neue Zutat“. Quelle: E-07 (Fehler). Offline: offline lesend.

- AC-014: Angenommen „DemoRezept“ ohne Zutaten · Dann steht unter „Zutaten“ „+ Zutat“ · Wenn ich es
  tippe · Dann ist „Neue Zutat“ offen

**REQ-008 — Foto unter dem Bild.** Auf der Seite eines Rezepts und einer Sammlung stehen „Foto ändern“
und „Foto entfernen“ direkt unter dem Bild wie bei Restaurants und Aktivitäten. Quelle: E-08.
Offline: nur online.

- AC-015: Angenommen „Apfelkuchen“ mit Foto · Dann stehen unter dem Bild „Foto ändern“ und „Foto
  entfernen“

**REQ-009 — Vollbild.** Tippen auf ein Foto (Rezept, Sammlung, Restaurant, Aktivität) zeigt es im
Vollbild; Schließen mit X, Escape oder Wisch nach unten. Quelle: B-02. Offline: offline lesend.

- AC-016: Angenommen „AMRIT“ mit Foto · Wenn ich auf das Foto tippe · Dann füllt es den Bildschirm ·
  Wenn ich nach unten wische · Dann bin ich zurück auf der Seite

**REQ-010 — Neues Restaurant aus „Rezepte“.** Lege ich unter „Rezepte“ über „Neu“ ein Restaurant an,
ist danach der Tab „Restaurants“ mit dem neuen Restaurant offen. Quelle: E-10. Offline: nur online.

- AC-017: Angenommen Tab „Rezepte“ · Wenn ich „Neu“ → „Restaurant“ → „Bless“ anlege · Dann ist
  „Restaurants“ gewählt und „Bless“ geöffnet

**REQ-011 — „Route“ nur mit Karten-Link.** „Route“ erscheint an Restaurant, Aktivität, Planeintrag und
in der Übersicht nur, wenn ein Karten-Link hinterlegt ist. Quelle: F-07. Offline: offline vollständig.

- AC-018: Angenommen „Bless“ hat Adresse, aber keinen Karten-Link · Dann fehlt „Route“ auf seiner
  Seite und in der Übersicht am Tag mit „Bless“

### Löschen und Sicherheit

**REQ-012 — Nachfrage vor dem Löschen.** Siehe Entscheidung 1. Quelle: F-08. Offline: wie die
jeweilige Aktion.

- AC-019: Angenommen „Apfelkuchen“ mit Foto · Wenn ich „Foto entfernen“ tippe · Dann fragt die App
  „Foto entfernen?“ mit „Entfernen“ und „Abbrechen“ · Und „Abbrechen“ lässt das Foto stehen
- AC-020: Angenommen Restaurant „Bless“ · Wenn ich „Löschen“ wähle · Dann fragt die App „„Bless“
  löschen?“, erst „Löschen“ löscht
- AC-021: Angenommen ein Eintrag der Einkaufsliste · Wenn ich ihn entferne · Dann siehe
  Entscheidung 1

**REQ-013 — Sicherheitswarnungen behoben.** Die zwei offenen Dependabot-Warnungen (`minimatch` <
11.0.1, `glob` < 14.0.2) sind geschlossen. Quelle: S-01. Offline: entfällt.

- AC-022: Angenommen der Stand nach dem Merge · Wenn ich die Dependabot-Warnungen abrufe · Dann ist
  keine offen · Und `pnpm check` und `pnpm build:web` sind grün

## Entscheidungen

1. OFFEN (REQ-012): Enrico wünscht Nachfrage bei allen Löschaktionen. Heute haben viele stattdessen
   5 s „Rückgängig“. Annahme: Nachfrage für Fotos, Rezepte, Sammlungen, Restaurants, Aktivitäten,
   Artikel, Aufgaben, Reisetaschen, Märkte; „Rückgängig“ ohne Nachfrage bleibt bei schnellen
   Listen-Aktionen (Einkaufsposten, Packstück, Planeintrag, Zutat im Entwurf, Erledigung im Verlauf).
2. REQ-005: Der neue Artikel „Schinken“ darf neben dem Synonym „Schinken“ von „Kochschinken“
   bestehen; ein exakter Name steht in der Suche vor einem Synonym. Ändert Spec 0025
   (Prüfung „Gibt es schon“) für den Fall Name = fremdes Synonym.
3. REQ-002: gespeichert in den lokalen Einstellungen (`LocalSettings`), nicht synchronisiert: jedes
   Gerät merkt sich seine Sortierung.
4. REQ-013: zuerst `workbox-build` aktualisieren; reicht das nicht, gezielte `pnpm.overrides` nur
   für die betroffenen Versionsbereiche, mit Prüfung von eslint und Expo CLI.

## Daten

Keine Schemaänderung. REQ-005 schreibt einen neuen Artikel über den bestehenden Befehl.

## Risiken

| Risiko                                    | Gegenmaßnahme                                 | Test                         |
| ----------------------------------------- | --------------------------------------------- | ---------------------------- |
| Löschen ohne Nachfrage bleibt irgendwo    | Liste aller Löschaktionen in der Spec abhaken | Komponenten-/e2e-Test je Art |
| Nachfrage verschluckt das Löschen offline | Nachfrage vor dem bestehenden Offline-Hinweis | Test offline: Knopf inaktiv  |
| override bricht eslint/Expo               | `pnpm check`, `pnpm build:web`, Dev-Smoke     | CI                           |

## Umsetzung

- [ ] 1. „Neu mischen“ reproduzieren (Test rot), beheben (AC-001, AC-002)
- [ ] 2. Sortierung in `LocalSettings` (AC-003, AC-004)
- [ ] 3. Filterabschnitt umbrechen (AC-005)
- [ ] 4. `SearchOrCreate`: Fokus halten, Enter exakt/neu; Küche mit Vorschlägen (AC-006–AC-009)
- [ ] 5. Suche/Anlegen bei Synonym (core, Tests) (AC-010–AC-012)
- [ ] 6. `KNOWN_UNITS` + (i) (AC-013)
- [ ] 7. „+ Zutat“ im Lesemodus (AC-014), Foto unter dem Bild (AC-015), Vollbild (AC-016)
- [ ] 8. Restaurant aus „Rezepte“ (AC-017), Route nur mit Link (AC-018)
- [ ] 9. Nachfrage vor Löschen nach Entscheidung 1 (AC-019–AC-021)
- [ ] 10. Dependabot (AC-022)
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün; `/security-check` (Löschen)
