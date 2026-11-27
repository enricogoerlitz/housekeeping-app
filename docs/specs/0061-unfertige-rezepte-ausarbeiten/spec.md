---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-27
---

# 0061 — Unfertige Rezepte nacheinander ausarbeiten

**Quelle:** Feature-Review KI, V4 „Unfertige Rezepte ausarbeiten, eins nach dem anderen“
(`tmp/feature-review/01-ki.md`), vom Inhaber freigegeben („gerne“). **Kritischer Pfad:** nein
(nur Oberfläche und Lesen aus dem Cache; das KI-Fenster und seine Function sind unverändert aus
Spec 0055).

## Ziel

Wir legen Rezepte oft schnell nur mit dem Namen an („erst anlegen, dann ausfüllen“). Bisher hat sie
Enrico mit Claude Code ausgearbeitet. Jetzt kann es jede und jeder in der App: In „Essen → Rezepte“
zeigt der Chip „Unfertig (12)“ diese Rezepte, „Ausarbeiten“ öffnet das erste gleich mit der
Websuche nach seinem Namen, und nach dem Speichern führt „Weiter zum nächsten“ zum nächsten, bis
keins mehr übrig ist.

## Nicht-Ziele

- Kein Kontingent und kein Budget-Alarm für die KI (macht Enrico selbst, Feature-Review V0).
- Keine Änderung am Datenmodell: „unfertig“ wird aus dem Rezept berechnet, nichts wird gespeichert.
- Kein Umbau der KI-Fenster: „Mit KI ausfüllen“ (Spec 0055), das Fenster „Neu“ und „Mit KI ändern“
  (Spec 0062) bleiben, wie sie sind; diese Spec öffnet nur das vorhandene Fenster.
- Kein Ausarbeiten mehrerer Rezepte in einem Rutsch ohne Prüfen: jedes Rezept wird einzeln
  übernommen und gespeichert.
- Keine Markierung „unfertig“ auf den Kacheln der Liste.

## Anforderungen

„Unfertig“ ist ein Rezept (Art „Rezept“) ohne Zutaten und ohne Schritte. „Ausarbeiten“ = die Seite
des Rezepts im Bearbeitungsmodus öffnen, darin „Mit KI ausfüllen“ auf „Websuche“ mit dem Titel, und
die Suche läuft schon.

### Was unfertig ist

**REQ-001 — Definition.** Ein Rezept ist unfertig, wenn es keine Zutaten und keine Schritte hat;
Beschreibung, Foto, Links, Videos, Schlagworte und Notizen ändern daran nichts. Sammlungen sind nie
unfertig. Quelle: V4 „Rezepte ohne Zutaten“, Skill `recipe-crud` („often just a name“). Offline:
offline vollständig.

- AC-001: Angenommen „Linsen-Dal“ ohne Zutaten und ohne Schritte · Dann ist es unfertig
- AC-002: Angenommen „Pfannkuchen“ ohne Zutaten mit 3 Schritten, „Salat“ mit 2 Zutaten ohne
  Schritte · Dann ist keins von beiden unfertig
- AC-003: Angenommen die leere Sammlung „Sommerfest“ · Dann ist sie nicht unfertig
- AC-004: Angenommen „Lifts Potatos“ nur mit Titel, Foto und einem TikTok-Link · Dann ist es
  unfertig

### Liste

**REQ-002 — Schnellchip „Unfertig“.** In der Filterzeile von „Essen → Rezepte“ und im Filterfenster
unter „Schnell“ steht als letzter Schnellchip „Unfertig (n)“ mit der Zahl aller unfertigen Rezepte
des Haushalts. Er filtert auf die unfertigen, zählt in „Filter (n)“ mit, steht in der Adresse
(`unfertig=1`) und wird von „Zurücksetzen“ mit abgeschaltet. Gibt es kein unfertiges Rezept, fehlt
er, außer er ist an. Offline: offline vollständig.

- AC-005: Angenommen 3 von 20 Rezepten sind unfertig · Dann steht in der Filterzeile „Unfertig (3)“
  · Wenn ich ihn tippe · Dann zeigt die Liste genau die 3 und die Adresse enthält `unfertig=1`
- AC-006: Angenommen kein Rezept ist unfertig und der Chip ist aus · Dann gibt es „Unfertig“ weder
  in der Filterzeile noch im Filterfenster
- AC-007: Angenommen „Unfertig“ und „Vegan“ sind an · Dann steht „Filter (2)“ · Wenn ich
  „Zurücksetzen“ tippe · Dann sind beide aus
- AC-008: Angenommen die Adresse `/rezepte?unfertig=1` · Wenn ich die Seite neu lade · Dann ist
  „Unfertig“ an
- AC-009: Angenommen „Unfertig“ ist an und das letzte unfertige Rezept wurde auf einem anderen Gerät
  ausgearbeitet · Dann zeigt die Liste „Alle Rezepte sind ausgearbeitet“ mit „Filter zurücksetzen“,
  und der Chip „Unfertig (0)“ bleibt zum Abschalten

**REQ-003 — Zähler und „Ausarbeiten“.** Ist „Unfertig“ an und zeigt die Liste Treffer, steht über
ihr statt „12 Rezepte“ der Zähler „Noch 12 unfertig“ und der Knopf „Ausarbeiten“. Er arbeitet das
erste Rezept der Liste in ihrer Reihenfolge aus (Suche und Sortierung gelten). Offline: offline
lesend — offline öffnet „Ausarbeiten“ das Rezept nur zum Lesen, weil Bearbeiten und KI Netz brauchen.

- AC-010: Angenommen „Unfertig“ an, Sortierung „A–Z“, Treffer „Apfelstrudel“, „Bami Goreng“,
  „Chili“ · Dann steht „Noch 3 unfertig“ · Wenn ich „Ausarbeiten“ tippe · Dann ist die Seite von
  „Apfelstrudel“ im Bearbeitungsmodus, „Mit KI ausfüllen“ ist auf „Websuche“ offen mit
  „Apfelstrudel“, und die Suche läuft
- AC-011: Angenommen offline, „Unfertig“ an · Wenn ich „Ausarbeiten“ tippe · Dann ist die Seite
  von „Apfelstrudel“ zum Lesen offen, ohne KI-Fenster

### Rezeptseite

**REQ-004 — Einstieg „Mit KI ausarbeiten“.** Auf der Seite eines unfertigen Rezepts steht beim
Lesen oben die Karte „Noch nicht ausgearbeitet“ mit „Mit KI ausarbeiten“; der Knopf arbeitet das
Rezept aus (ohne Tastatur, damit die Treffer sichtbar sind). Beim Bearbeiten, für Sammlungen und für
Rezepte mit Inhalt gibt es die Karte nicht. „Mit KI ausfüllen“ im Bearbeitungsmodus sucht weiterhin
nicht von selbst (Spec 0055, AC-016). Offline: nur online — der Knopf ist deaktiviert mit „Offline –
zum Bearbeiten brauchst du Netz“.

- AC-012: Angenommen „Linsen-Dal“ nur mit Titel · Wenn ich seine Seite öffne · Dann steht dort
  „Noch nicht ausgearbeitet“ mit „Mit KI ausarbeiten“
- AC-013: Angenommen die Seite von „Linsen-Dal“ · Wenn ich „Mit KI ausarbeiten“ tippe · Dann ist
  die Seite im Bearbeitungsmodus, „Mit KI ausfüllen“ zeigt „Websuche“ mit „Linsen-Dal“, die Suche
  läuft genau einmal, und das Suchfeld hat nicht den Cursor
- AC-014: Angenommen „Lasagne“ mit Zutaten · Dann gibt es auf ihrer Seite keine Karte „Noch nicht
  ausgearbeitet“
- AC-015: Angenommen offline auf der Seite von „Linsen-Dal“ · Dann ist „Mit KI ausarbeiten“
  deaktiviert mit „Offline – zum Bearbeiten brauchst du Netz“
- AC-016: Angenommen „Linsen-Dal“ im Bearbeitungsmodus über den Stift · Wenn ich „Mit KI ausfüllen“
  tippe · Dann steht „Linsen-Dal“ im Suchfeld, und es wird nicht gesucht

**REQ-005 — „Weiter zum nächsten“.** Auf der Seite eines unfertigen Rezepts steht in der Karte
zusätzlich „Weiter zum nächsten“ (zum Überspringen, z. B. bei „PAO“) mit „Noch 11 weitere
unfertig“. Wurde ein Rezept, das beim Öffnen seiner Seite unfertig war, ausgearbeitet und
gespeichert, steht beim Lesen die Karte „Ausgearbeitet · noch 11 unfertig“ mit „Weiter zum
nächsten“. Das nächste ist das nächste unfertige Rezept nach diesem in der Reihenfolge der Liste,
aus der die Seite geöffnet wurde (Spec 0034, REQ-008), danach von vorn; unfertige Rezepte außerhalb
dieser Reihenfolge folgen A–Z; ohne Liste gilt A–Z. Es wird ausgearbeitet wie mit „Ausarbeiten“.
Ist keins mehr übrig, steht „Alle Rezepte sind ausgearbeitet“ ohne Knopf. Neben der Liste
(Schnellansicht, Spec 0038) gibt es „Weiter zum nächsten“ nicht. Offline: offline lesend —
„Weiter zum nächsten“ öffnet das nächste offline zum Lesen.

- AC-017: Angenommen „Ausarbeiten“ aus der Liste „Unfertig“ A–Z mit „Apfelstrudel“, „Bami Goreng“,
  „Chili“ · Wenn ich „Apfelstrudel“ mit Zutaten speichere · Dann steht „Ausgearbeitet · noch 2
  unfertig“ · Wenn ich „Weiter zum nächsten“ tippe · Dann ist „Bami Goreng“ im Bearbeitungsmodus mit
  „Mit KI ausfüllen“ auf „Websuche“ und laufender Suche
- AC-018: Angenommen die Seite von „Bami Goreng“, noch unfertig · Dann steht „Noch 2 weitere
  unfertig“ · Wenn ich „Weiter zum nächsten“ tippe · Dann öffnet „Chili“, und „Bami Goreng“ bleibt
  unfertig
- AC-019: Angenommen „Chili“ ist das letzte der Reihenfolge und „Bami Goreng“ noch unfertig · Wenn
  ich „Chili“ speichere und „Weiter zum nächsten“ tippe · Dann öffnet „Bami Goreng“
- AC-020: Angenommen „Chili“ ist das letzte unfertige Rezept · Wenn ich es mit Zutaten speichere ·
  Dann steht „Alle Rezepte sind ausgearbeitet“ und kein „Weiter zum nächsten“
- AC-021: Angenommen „Chili“ ist aus der Übersicht geöffnet (keine Liste), unfertig sind noch
  „Apfelstrudel“ und „Bami Goreng“ · Wenn ich „Weiter zum nächsten“ tippe · Dann öffnet
  „Apfelstrudel“
- AC-022: Angenommen „Bami Goreng“ wurde auf einem anderen Gerät ausgearbeitet · Dann überspringt
  „Weiter zum nächsten“ auf „Apfelstrudel“ es und der Zähler zählt es nicht
- AC-023: Angenommen Desktop, Ansicht „Liste“, „Linsen-Dal“ neben der Liste · Dann steht dort „Mit
  KI ausarbeiten“, aber kein „Weiter zum nächsten“
- AC-024: Angenommen offline auf der Seite von „Apfelstrudel“ · Wenn ich „Weiter zum nächsten“
  tippe · Dann ist „Bami Goreng“ zum Lesen offen, ohne Bearbeitungsmodus

## Entscheidungen

1. **Definition (REQ-001):** keine Zutaten und keine Schritte — dieselbe Regel, nach der „Mit KI
   ausfüllen“ auf „Websuche“ statt „Prompt“ öffnet (Spec 0055, REQ-005, Entscheidung 4). Ein Foto
   oder Link macht ein Rezept nicht fertig, weil man ohne Zutaten nicht einkaufen und ohne Schritte
   nicht kochen kann. Als `isUnfinishedRecipe` in `packages/core`.
2. **Ein Schnellchip statt eigener Seite (REQ-002):** „Unfertig“ ist ein Filterwert wie
   „Favoriten“ und kombinierbar mit Suche und Sortierung. Er steht zuletzt, weil er ein
   Aufräumwerkzeug ist und kein Essenswunsch, und nur, wenn es etwas aufzuräumen gibt (bei 0
   unfertigen wäre er Ballast). Die Zahl im Chip ersetzt den Knopf „Ausarbeiten (12)“ aus V4, der
   Knopf steht über der Liste, sobald der Filter an ist.
3. **Die Suche startet sofort (REQ-004):** Bei einem unfertigen Rezept gibt es nur den Titel zu
   suchen; das spart einen Tipp je Rezept (≈ 0,1 ct je Suche, Serper). Ohne Tastatur, damit die
   Treffer nicht verdeckt sind. Nur über „Ausarbeiten“, „Mit KI ausarbeiten“ und „Weiter zum
   nächsten“; der Weg über den Stift bleibt wie in Spec 0055.
4. **„Weiter zum nächsten“ arbeitet gleich aus (REQ-005):** wie V4 („öffnet im Bearbeitungsmodus
   mit Mit KI ausfüllen“). So kostet ein Rezept etwa drei Tipps: Treffer, „Übernehmen“,
   „Speichern“, dazu „Weiter“. Wer überspringen will, schließt Fenster und Bearbeitungsmodus mit
   „Abbrechen“ (ohne Änderung ohne Rückfrage) und tippt „Weiter zum nächsten“.
5. **Reihenfolge (REQ-005):** die gemerkte Reihenfolge der Liste (Spec 0034, nur im Speicher), damit
   „nächstes“ dasselbe heißt wie beim Wischen; von vorn, damit Übersprungene wiederkommen, bis keins
   übrig ist; ohne Liste A–Z, weil das ohne Kontext am leichtesten nachzuvollziehen ist. Als
   `nextUnfinished` in `packages/core`.
6. **„Ausgearbeitet“ nur nach dem Öffnen als unfertig:** Die Seite merkt sich beim Öffnen, ob das
   Rezept unfertig war; nur dann folgt nach dem Speichern die Karte „Ausgearbeitet“. Bei einem
   ganz normalen Rezept stört so nichts.
7. **Übergabe an die Seite:** „Ausarbeiten“ und „Weiter“ legen die Bitte „ausarbeiten“ für die
   Rezept-ID im Speicher ab (wie die Übergaben von Spec 0018 und 0040); die Seite nimmt sie einmal
   und öffnet den Bearbeitungsmodus mit der neuen Absicht `ai` (`EditIntent`), die „Mit KI
   ausfüllen“ mit sofortiger Suche öffnet. Kein Adressparameter, weil der Bearbeitungsmodus nie in
   der Adresse steht.
8. **Schnellansicht ohne „Weiter“ (AC-023):** Neben der Liste ist das nächste Rezept direkt
   daneben zu sehen; die Karte „Ausgearbeitet“ entfällt dort ebenfalls.
9. **Abgrenzung zu Spec 0062:** „Mit KI ändern“ (✨) auf der Rezeptseite ist für Rezepte mit
   Inhalt; die Karte „Noch nicht ausgearbeitet“ ist der Einstieg für Rezepte ohne. Beide öffnen
   dasselbe KI-Fenster. Ohne den Schalter `features.aiRecipes` gibt es die Karte nicht; Chip,
   Zähler und „Ausarbeiten“ öffnen dann den Bearbeitungsmodus ohne KI-Fenster.
10. Nachklick 27.11., N-02/iN-03 (ändert Entscheidung 9): Auf einem unfertigen Rezept heißt ✨ im
    Kopf „Mit KI ausarbeiten“ und tut dasselbe wie die Karte (Bearbeitungsmodus, „Mit KI ausfüllen“
    sucht den Titel sofort, ohne Tastatur). „Mit KI ändern“ gibt es nur bei Rezepten mit Inhalt; so
    hat jeder Einstieg eine Bedeutung. iN-08: Ein gewählter Chip der Chipzeile scrollt ganz ins
    Bild, frei vom Ausblendverlauf („Unfertig (4)“ lesbar).

## Daten

Gelesen: Rezepte aus dem lokalen Cache (Zutaten, Schritte, Art, Titel). Geschrieben: nichts Neues
— gespeichert wird wie bisher über „Speichern“ (Spec 0037); KI und Websuche wie Spec 0055/0049.
Adresse: neuer Parameter `unfertig=1` auf `/rezepte`. Keine Schema- oder Cache-Änderung, keine
personenbezogenen Daten.

## Umsetzung

- [x] 1. core: `isUnfinishedRecipe`, Filterwert `unfinished` mit Schnellchip, Adresse
      `unfertig`, `nextUnfinished`, Texte (AC-001 – AC-010, AC-017 – AC-022), Vitest rot → grün
- [x] 2. App: Chip mit Zahl, Leerzustand, Zähler und „Ausarbeiten“ über der Liste (AC-005 –
      AC-011)
- [x] 3. App: Karte auf der Rezeptseite, Absicht `ai`, sofortige Suche im KI-Fenster, „Weiter zum
      nächsten“ (AC-012 – AC-024)
- [x] 4. e2e `e2e/rundgang-unfertige-rezepte-0061.spec.ts` (Websuche mit `page.route`), Glossar
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün, Screenshots in
      `tmp/review-0004/0061/`

### Nachweis

- Rot vor Grün (Vitest): `packages/core/src/unfinished-recipes.test.ts` mit Platzhaltern 18 rot,
  3 grün (21); danach alle grün. `url-params.test.ts` „every filter survives the round trip“ um
  `unfinished` ergänzt.
- `pnpm format:check && pnpm check && pnpm build:web` grün (core 1993 Tests), nach dem Merge von
  `develop` (0054, 0055, 0056, 0059).
- e2e `e2e/rundgang-unfertige-rezepte-0061.spec.ts` geschrieben, nicht lokal gelaufen (setzt die
  Datenbank zurück; läuft beim Mergen).
- Screenshots (eigener Dev-Server, Websuche und KI mit `page.route`): `tmp/review-0004/0061/` —
  Desktop: Liste „Unfertig (3)“ mit „Noch 3 unfertig“ und „Ausarbeiten“, Karte „Noch nicht
  ausgearbeitet“, KI-Fenster mit laufender Websuche (genau eine Suche), „Ausgearbeitet · noch 2
  unfertig“ mit „Weiter zum nächsten“; Handy: Liste, Karte, KI-Fenster ohne Tastatur.
- Beim Ansehen gefunden: Der Rahmen der Rezeptseite baut seinen Inhalt beim Wechsel in den
  Bearbeitungsmodus neu auf (Wischen aus, Spec 0034). Darum merkt sich die Seite selbst, ob sie
  auf einem unfertigen Rezept geöffnet wurde, und „Mit KI ausfüllen“ folgt der Absicht `ai` statt
  eigenem Zustand.
