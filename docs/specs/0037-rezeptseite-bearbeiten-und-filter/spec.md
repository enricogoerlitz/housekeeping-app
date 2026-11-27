---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0037 — Rezeptseite: ein Bearbeitungsmodus, Sammlungen im Filter, Einkauf mit Personen

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
E-04, E-05, E-07, E-09, E-11, E-12, E-17 Schlagwort-Filter). **Welle 2.** **Kritischer Pfad:** ja:
Migration (Dauer an Sammlungen, Entscheidung 2), Sync (Speichern mehrerer Abschnitte in einem
Schritt).

## Ziel

Die Rezept- und Sammlungsseite ist in Ruhe eine schöne Ansicht ohne Stifte. Ein Stift oben rechts
macht alles bearbeitbar, „Speichern“ oben rechts sichert alles auf einmal. Sammlungen erscheinen in
passenden Filtern, haben eine Dauer, und auf die Einkaufsliste kommt ein Rezept für die gewählte
Zahl Personen. Zutaten eines anderen Rezepts (Pizzateig) lassen sich als Gruppe übernehmen.

## Nicht-Ziele

- Keine KI auf der Seite (Spec 0040 hängt sich in den Bearbeitungsmodus ein).
- Keine Verknüpfung zwischen Rezepten: übernommene Zutaten sind Kopien.
- Kein neues Foto-Fenster (Spec 0039).

## Anforderungen

Haushalt „Enrico & Nadja“, heute ist Donnerstag, 26.11.2026.

### Rezeptseite

**REQ-001 — Ein Bearbeitungsmodus.** Im Lesemodus hat die Rezept- und Sammlungsseite keine Stifte in
den Abschnitten; ein Stift oben rechts schaltet die ganze Seite in den Bearbeitungsmodus, „Speichern“
und „Abbrechen“ stehen dann oben rechts. „+ Zutat“ und „+ Rezept“ bleiben im Lesemodus sichtbar und
öffnen den Bearbeitungsmodus mit dem passenden Fenster. Ersetzt den „Abschnitt der Rezeptseite“
(Spec 0008 REQ-007, Spec 0023). Quelle: E-07. Offline: offline lesend (Bearbeiten braucht Netz).

- AC-001: Angenommen „Apfelkuchen“ im Lesemodus · Dann gibt es auf der Seite genau einen Stift (oben
  rechts), und „+ Zutat“ ist sichtbar
- AC-002: Angenommen „Apfelkuchen“ · Wenn ich „+ Zutat“ tippe · Dann ist die Seite im
  Bearbeitungsmodus und „Neue Zutat“ offen
- AC-003: Angenommen Bearbeitungsmodus, Titel „Apfelkuchen“ → „Omas Apfelkuchen“ und Zutat „Zimt“
  neu · Wenn ich „Speichern“ tippe · Dann sind beide Änderungen gespeichert und die Seite im Lesemodus
- AC-004: Angenommen dieselben Änderungen, der Server lehnt die Zutat ab · Wenn ich „Speichern“ tippe ·
  Dann ist nichts gespeichert, der Bearbeitungsmodus bleibt mit der Fehlermeldung offen
- AC-005: Angenommen Bearbeitungsmodus mit Änderungen · Wenn ich „Abbrechen“ tippe oder die Seite
  verlasse · Dann fragt die App „Änderungen verwerfen?“
- AC-006: Angenommen Nadja hat das Rezept gespeichert, während ich bearbeite · Wenn ich speichere ·
  Dann gelten meine geänderten Felder, ihre übrigen Änderungen bleiben, und ein Hinweis sagt „Nadja
  hat das Rezept zwischendurch geändert“
- AC-007: Angenommen offline · Dann ist der Stift deaktiviert mit dem Offline-Hinweis

**REQ-002 — Neu-Fenster mit mehr Möglichkeiten.** „Neu → Rezept/Sammlung“ hat neben dem Titel
aufklappbar: Foto (Foto-Fenster, Spec 0039), Zutaten einfügen (Rezept) bzw. Rezepte wählen
(Sammlung) und „Mit KI ausfüllen“ (Spec 0040). Der Titel allein reicht. Quelle: E-09. Offline: nur
online.

- AC-008: Angenommen „Neu → Rezept“ · Wenn ich nur „Linsen-Dal“ eingebe und „Anlegen“ tippe · Dann ist
  „Linsen-Dal“ angelegt und seine Seite offen
- AC-009: Angenommen „Neu → Sammlung“ · Wenn ich „Grillabend“ eingebe, „Steak“ und „Salat“ wähle und
  anlege · Dann enthält „Grillabend“ beide Rezepte

**REQ-003 — Zutaten aus Rezept übernehmen.** Im Bearbeitungsmodus „Aus Rezept übernehmen“: ein
Rezept wählen, seine Zutaten kommen als Kopie in eine Gruppe mit dem Rezeptnamen. Quelle: E-12.
Offline: offline lesend.

- AC-010: Angenommen „Pizza Margherita“ ohne Zutaten, „Pizzateig“ mit 4 Zutaten für 2 Portionen ·
  Wenn ich „Pizzateig“ übernehme · Dann stehen 4 Zutaten in der Gruppe „Pizzateig“ · Und eine spätere
  Änderung an „Pizzateig“ ändert sie nicht
- AC-011: Angenommen „Pizza Margherita“ hat 4 Portionen, „Pizzateig“ 2 · Dann werden die Mengen auf 4
  Portionen umgerechnet
- AC-012: Angenommen das gewählte Rezept hat keine Zutaten · Dann sagt die App „„Pizzateig“ hat keine
  Zutaten“

### Filter

**REQ-004 — Sammlungen im Filter.** Eine Sammlung passt zu einem Ernährungsfilter, wenn alle
enthaltenen Rezepte und eigenen Zutaten passen (gibt es schon); zu Gerichtart und Küche, wenn ein
enthaltenes Rezept passt. Eine leere Sammlung passt zu jedem Filter. Quelle: E-04. Offline: offline
vollständig.

- AC-013: Angenommen Sammlung „Grillabend“ ohne Inhalt · Wenn ich „vegetarisch“ filtere · Dann steht
  „Grillabend“ in der Liste
- AC-014: Angenommen „Grillabend“ mit „Steak“ und „Salat“ · Wenn ich „vegetarisch“ filtere · Dann fehlt
  „Grillabend“
- AC-015: Angenommen „Grillabend“ mit „Steak“ (Gerichtart „Hauptgericht“) · Wenn ich „Hauptgericht“
  filtere · Dann steht „Grillabend“ in der Liste

**REQ-005 — Dauer an Sammlungen.** Eine Sammlung hat ein Feld „Zeit in Minuten“ wie ein Rezept; der
Dauer-Filter gilt dafür. Ohne Angabe passt sie zu keinem Dauer-Filter (wie Rezepte). Quelle: E-05.
Offline: offline lesend.

- AC-016: Angenommen „Grillabend“ mit 90 Minuten · Wenn ich „< 2 h“ filtere · Dann steht „Grillabend“
  in der Liste · Und bei „< 30 min“ fehlt er
- AC-017: Angenommen ein Mitglied eines anderen Haushalts · Dann kann es die Dauer von „Grillabend“
  weder lesen noch ändern

**REQ-006 — Schlagwort-Filter.** Rezepte und Restaurants lassen sich im Filter nach Schlagworten
filtern: ein durchsuchbares Auswahlfeld mit den Schlagworten des Haushalts, Mehrfachauswahl, ein
Eintrag passt, wenn er alle gewählten trägt. Gespeichert in der Adresse wie die anderen Filter.
Quelle: E-17. Offline: offline vollständig.

- AC-018: Angenommen Rezepte mit „Ofen“ und „Familie“ · Wenn ich im Filter „Ofen“ suche und wähle ·
  Dann stehen nur Rezepte mit „Ofen“ in der Liste, und der Filter-Knopf zeigt „1“
- AC-019: Angenommen kein Rezept hat Schlagworte · Dann fehlt der Abschnitt „Schlagworte“ im Filter

### Einkauf

**REQ-007 — Auf die Liste für N Personen.** „Auf die Liste“ zeigt oben im Vorratscheck einen Stepper
„Für N Personen“, vorbelegt mit den Portionen des Rezepts bzw. der Sammlung; die Mengen rechnen sich
beim Ändern sofort um. Quelle: E-11. Offline: offline lesend.

- AC-020: Angenommen „Apfelkuchen“ für 2 Portionen mit „200 g Mehl“ · Wenn ich „Auf die Liste“ wähle
  und „Für 4 Personen“ einstelle · Dann zeigt der Vorratscheck „400 g Mehl“
- AC-021: Angenommen eine Zutat ohne Menge („Salz“) · Dann bleibt sie ohne Menge

## Entscheidungen

1. REQ-001 speichert über eine Datenbank-Funktion in einer Transaktion (Regel „Mehrzeilige Aktionen
   sind ein RPC“), die nur die geänderten Felder und Zeilen schickt; zuletzt gespeichert gewinnt je
   Feld (AC-006).
2. Enrico, 26.11.: Dauer der Sammlung wird eingegeben (nicht abgeleitet); die Migration lockert den
   Check `recipes_kind_fields` nur für `total_minutes`.
3. Enrico, 26.11.: Personen als Stepper im Vorratscheck, kein eigener Schritt.
4. Glossar „Abschnitt der Rezeptseite“ wird ersetzt durch **Bearbeitungsmodus**.
5. Bau 26.11.: Die Speicher-Funktion ist `save_recipe_page(p_household_id, p_recipe_id,
p_seen_updated_at, p_ops)`: sie sperrt das Rezept, vergleicht sein `updated_at` mit dem Stand beim
   Öffnen (`Recipe.updatedAt`, nur gelesen) und ruft `apply_changes` mit denselben Ops auf (Allowlist,
   RLS, Trigger unverändert). Nur Zeilen-Ops auf `recipes` (Patch genau dieses Rezepts), `articles`
   (ohne Löschen), `collection_recipes`, `meal_plan_entries`. `apply_changes` und `CACHE_VERSION`
   bleiben unverändert (die Cache-Zeilen trugen `updated_at` schon).
6. Bau 26.11.: Zeilen ohne Artikel oder doppelt eingefügte halten „Speichern“ zurück („Erst für jede
   Zutat einen Artikel wählen“); früher speicherte „Fertig“ den Rest. Eine Seite wird nie halb
   gespeichert.
7. Bau 26.11.: „+ Rezept“ öffnet den Bearbeitungsmodus mit „Rezepte zu …“; das Fenster übernimmt die
   Rezepte wie bisher sofort (eigener Schreibweg, Spec 0009), sie erscheinen dann in „Enthält“.
   ⋯ → „Entfernen“ einer Zutat im Lesemodus bleibt ein eigener Schreibweg mit Rückfrage (Spec 0036);
   ⋯ → „Zutat bearbeiten“ öffnet den Bearbeitungsmodus mit der Zeile.
8. Bau 26.11.: AC-016 braucht „< 2 h“: der Dauer-Filter bekommt „< 2 Std“ (120, Adresse `dauer=120`).
9. Bau 26.11.: Eine Sammlung trägt keine Schlagworte und passt daher zu keinem Schlagwort-Filter; die
   leere Sammlung passt zu jeder Ernährung, Gerichtart und Küche, aber zu keinem Dauer-Filter
   (REQ-005).
10. Bau 26.11.: Gefragt wird beim Zurück-Link, Android-Zurück, Escape und (Browser) beim Neuladen oder
    Schließen des Tabs; das Wischen zum Nachbarrezept ist im Bearbeitungsmodus aus.
11. OFFEN: AC-006 nennt „Nadja“. Rezepte speichern nicht, wer zuletzt geändert hat; der Hinweis lautet
    daher „Das Rezept wurde zwischendurch geändert. Deine Änderungen gelten, die übrigen bleiben.“
    Mit Namen bräuchte es eine Spalte `updated_by` (Migration) – Entscheidung Enrico.
12. OFFEN: Browser-Zurück und der Wechsel des Tabs unten verwerfen ungespeicherte Änderungen ohne
    Frage (der Router bietet dafür keinen Haken ohne neue Abhängigkeit).
13. Browser-Durchklick 27.11. (Review 0003, B-01): „Kein Schlagwort gefunden.“ steht nur, wenn
    kein Schlagwort des Haushalts zur Suche passt — ein schon gewähltes passendes zählt mit.
14. Browser-Durchklick 27.11. (B-03, REQ-005): Die Dauer einer Sammlung steht im Lesemodus in der
    Zeile unter dem Titel wie beim Rezept: „für 2 · 2 Rezepte · 90 Min“ (`collectionSummary`).
15. Browser-Durchklick 27.11. (B-04, REQ-002): Im Fenster „Neu“ fragen Escape, Tipp daneben und
    „Abbrechen“ „Änderungen verwerfen?“ („Weiter bearbeiten“ / „Verwerfen“), sobald Titel, Zutaten,
    Rezepte oder ein Foto eingegeben sind; ein leeres Fenster schließt sofort.

## Daten

Migration: Check `recipes_kind_fields` erlaubt `total_minutes` bei `kind = 'collection'`. Neue
Datenbank-Funktion zum Speichern der Rezeptseite (Kopf, Einordnung, Zutaten, Schritte, Notizen, Links)
in einer Transaktion, `security invoker` unter RLS.

## Risiken

| Risiko                                     | Gegenmaßnahme                             | Test                                |
| ------------------------------------------ | ----------------------------------------- | ----------------------------------- |
| Speichern bricht halb ab                   | eine Funktion, eine Transaktion           | pgTAP: Fehler in Zutat → nichts     |
| Fremder Haushalt / abgemeldet speichert    | RLS, Funktion läuft als Aufrufer          | pgTAP fremder Haushalt, abgemeldet  |
| Sammlung bekommt Rezept-Felder (Küche)     | Check lockert nur `total_minutes`         | pgTAP Check                         |
| Sync verpasst Änderungen                   | bestehende Trigger, `updated_at` je Zeile | pgTAP Trigger                       |
| Funktion schreibt Fremdes (Domain-Ops)     | Filter: nur Zeilen-Ops der Seite          | pgTAP „domain op“, „another recipe“ |
| Eigenes Speichern gilt als „zwischendurch“ | letztes eigenes `updated_at` gemerkt      | api-Test AC-006 (zweites Speichern) |

## Umsetzung

- [x] 1. Migration Check + Speicher-Funktion (`db-change`, pgTAP) (AC-003, AC-004, AC-017)
- [x] 2. Bearbeitungsmodus der Rezept- und Sammlungsseite, Lesemodus ohne Stifte (AC-001–AC-007)
- [x] 3. Neu-Fenster (AC-008, AC-009)
- [x] 4. Aus Rezept übernehmen (core-Funktion + Picker) (AC-010–AC-012)
- [x] 5. Filter: Sammlungen, Dauer, Schlagworte (core + Adresse + Auswahlfeld) (AC-013–AC-019)
- [x] 6. Personen-Stepper im Vorratscheck (AC-020, AC-021)
- [x] 7. Glossar „Bearbeitungsmodus“
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün;
      `pnpm exec supabase test db`; `/security-check`

**Nachweis (26.11.2026):** pgTAP `recipe_page_save` (27) und `collections` grün, rot zuerst;
`pnpm exec supabase test db` war vor fremden Migrationen anderer Wellen-2-Agenten auf der geteilten
lokalen DB vollständig grün (55 Dateien, 2700 Tests); core `page-editor`, `recipe-list-0037`, api
`commands-recipe-page`, `pantry-portions`, `transport-supabase` (rot zuerst); `pnpm format:check &&
pnpm check && pnpm build:web` grün; Screenshots Handy/Desktop in `tmp/review-0003/0037/`;
`/security-check`: ein niedriger Befund (Domain-Ops im Filter) behoben.
