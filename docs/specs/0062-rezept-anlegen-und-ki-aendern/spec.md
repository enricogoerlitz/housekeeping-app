---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-27
---

# 0062 — Rezept anlegen und mit KI ändern

**Quelle:** Enricos Review 0004 vom 27.11.2026 („Rezept erstellen“, „Rezept bearbeiten“,
„Aktivität/Restaurant anlegen“) und das freigegebene Konzept
`tmp/review-0004/konzept-anlegen/KONZEPT.md`: **Anlegen = Variante A „Ein Feld, drei Wege“**,
**Bearbeiten = E2 „KI-Fenster von der Rezeptseite“**, Variante C nicht. Alle Empfehlungen des
Konzepts (Fragen 1–3) sind freigegeben. Baut auf Spec 0055 (KI-Fenster v3) und Spec 0054
(Bedienmuster) auf. **Kritischer Pfad:** nein (keine Datenbank-, Rechte- oder Sync-Änderung;
gespeichert wird über die vorhandenen Wege `createRecipe` und `save_recipe_page`).

## Ziel

Ich tippe auf „+“, schreibe, was ich will, und tippe einen Weg an: „Anlegen“ legt das Rezept mit
dem Titel an, „Websuche“ zeigt Treffer im selben Fenster, „KI-Rezept“ schreibt es mir. Die App
hebt den Weg hervor, der zur Eingabe passt, und Return nimmt ihn. Ein Restaurant oder eine
Aktivität lege ich genauso an, nur mit „Anlegen“ und „Websuche“. Ein vorhandenes Rezept ändere ich
mit ✨ direkt von seiner Seite: Wunsch tippen, Vorschlag prüfen, „Übernehmen“ – gespeichert, mit
„Rückgängig“.

## Nicht-Ziele

- Keine Variante C (Anlegen aus der Rezeptsuche) und kein E1 (KI-Zeile im Bearbeitungsmodus).
- Kein ✨ „Mit KI ändern“ auf der Seite eines Restaurants oder einer Aktivität (Konzept,
  Abschnitt Einheitlichkeit): dort bleibt „Im Web suchen“ im Formular „bearbeiten“ (Spec 0055).
- Keine weiteren Änderungen an der Rezeptseite: Aktionen, „+ Zutat“, Galerie, ⋯ gehören Spec 0056
  bzw. 0054. Hier nur der ✨-Einstieg in der Kopfzeile und die Fotovorschläge nach ✨ (REQ-012).
- Keine animierte Fortschrittsanzeige mit Häkchen je Teil beim KI-Rezept (Bild 5 des Konzepts):
  es bleiben die pulsierenden Platzhalter von Spec 0055 (`LoadingLines`).
- Kein Rückgängig für ein übernommenes Foto (REQ-010): es nimmt nur Text, Zutaten, Varianten,
  Schritte, Einordnung und Links zurück.
- Keine Änderung an Datenbank, Edge Functions oder Vertrag.

## Anforderungen

### Rezept anlegen: ein Feld, drei Wege

**REQ-001 — Das Fenster „Neues Rezept“.** „+“ im Tab „Rezepte“ (`CreateButton` „Rezept anlegen“,
Spec 0054) öffnet „Neues Rezept“ mit einem Feld „Gericht, Wunsch oder Link“ (mit Mikrofon), das den
Cursor hat; darunter immer dieselben drei Knöpfe **Anlegen · Websuche · KI-Rezept**; darunter
leise „Foto“, „Zutaten“, „Sammlung“ und „Mehr ›“. Der Fensterkopf hat Titel und ✕ (die Knöpfe sind
die Aktionen). Ohne KI-Schalter (`features.aiRecipes`) gibt es nur „Anlegen“. Offline: nur online
(alle Knöpfe ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“).

- AC-001: Angenommen Essen → Rezepte · Wenn ich „Rezept anlegen“ drücke · Dann ist „Neues Rezept“
  offen, „Gericht, Wunsch oder Link“ hat den Cursor, und „Anlegen“, „Websuche“, „KI-Rezept“ stehen
  darunter, deaktiviert, solange das Feld leer ist
- AC-002: Angenommen offline · Wenn ich „Neues Rezept“ ansehe · Dann sind alle drei Knöpfe
  deaktiviert und sagen den Offline-Hinweis

**REQ-002 — Hervorhebung folgt der Eingabe.** Gefüllt (Akzent) ist der Weg, den die Eingabe
nahelegt; die anderen bleiben an ihrem Platz. Rezept: 1–3 Wörter → „Websuche“; ab 4 Wörtern, mit
einer Zahl oder mit einem Link → „KI-Rezept“. Return löst den hervorgehobenen Weg aus (die
Return-Taste heißt „Suchen“ bzw. „Los“). Eine Websuche startet nur auf Tap oder Return, nie beim
Tippen. Offline: nur online.

- AC-003: Angenommen „Spaghetti Bolognese“ im Feld · Dann ist „Websuche“ hervorgehoben
- AC-004: Angenommen „Meatball Pasta scharf ohne Sahne“ im Feld · Dann ist „KI-Rezept“
  hervorgehoben
- AC-005: Angenommen „Pasta für 4“ im Feld · Dann ist „KI-Rezept“ hervorgehoben
- AC-006: Angenommen „https://www.chefkoch.de/rezepte/123“ im Feld · Dann ist „KI-Rezept“
  hervorgehoben
- AC-007: Angenommen „Spaghetti Bolognese“ im Feld · Wenn ich Return drücke · Dann wird genau
  einmal im Web nach „Spaghetti Bolognese“ gesucht; beim Tippen davor gab es keine Suche
- AC-008: Angenommen nur Leerzeichen im Feld · Dann ist kein Weg hervorgehoben und Return tut
  nichts

**REQ-003 — „Anlegen“.** Speichert sofort ein Rezept mit dem Text als Titel und öffnet seine Seite
(wie bisher „Anlegen“ im Fenster „Neu“); ein unter „Foto“ gewähltes Foto und unter „Zutaten“
eingefügte Zeilen kommen mit (Spec 0037, REQ-002; Spec 0018). Offline: nur online.

- AC-009: Angenommen „Linsen-Dal“ im Feld · Wenn ich „Anlegen“ drücke · Dann gibt es das Rezept
  „Linsen-Dal“ und seine Seite ist offen
- AC-010: Angenommen ein Text mit 201 Zeichen · Wenn ich „Anlegen“ drücke · Dann steht der Hinweis
  zum Titel unter dem Feld und nichts ist gespeichert

**REQ-004 — „Websuche“ im selben Fenster.** Sucht den Text; die Tastatur geht weg, die Treffer
erscheinen unter den Knöpfen im selben Fenster (das Fenster wächst auf `l`). Ein Tipp ins Feld holt
die Tastatur zurück, der Text bleibt. Ab dem Treffer läuft alles wie Spec 0049: Vorschau →
„Übernehmen“ → Rezeptseite im Bearbeitungsmodus → „Speichern“. Offline: nur online.

- AC-011: Angenommen „Spaghetti Bolognese“ im Feld · Wenn ich „Websuche“ drücke · Dann stehen die
  Treffer im Fenster „Neues Rezept“, Feld und drei Knöpfe stehen darüber
- AC-012: Angenommen die Treffer aus AC-011 · Wenn ich den ersten öffne und „Übernehmen“ drücke ·
  Dann ist die Rezeptseite im Bearbeitungsmodus mit dem Rezept des Treffers, noch nicht gespeichert
- AC-013: Angenommen die Treffer aus AC-011 · Wenn ich danach „KI-Rezept“ drücke · Dann schreibt
  die KI aus demselben Text, ohne dass ich neu tippe

**REQ-005 — „KI-Rezept“.** Die KI schreibt das Rezept aus dem Feld (ein Link darin wird gelesen,
Spec 0049 AC-002); „Foto generieren“ ist an. Bis zur Antwort pulsieren Platzhalter im Fenster.
Danach öffnet die Rezeptseite im Bearbeitungsmodus mit dem Entwurf (wie Spec 0040, AC-001).
Scheitert es, bleibt der Text im Feld mit dem Hinweis. Offline: nur online.

- AC-014: Angenommen „Meatball Pasta scharf ohne Sahne für 4“ · Wenn ich „KI-Rezept“ drücke ·
  Dann bekommt `ai-recipe-draft` den Satz als `text` mit `imagePrompt: true`, und danach ist die
  Rezeptseite im Bearbeitungsmodus mit dem Titel des Entwurfs
- AC-015: Angenommen ein Link im Feld · Wenn ich Return drücke · Dann bekommt `ai-recipe-draft` den
  Link in `links`
- AC-016: Angenommen die KI ist nicht erreichbar · Wenn ich „KI-Rezept“ drücke · Dann bleibt das
  Fenster mit dem Text offen und darunter steht der Hinweis der KI-Störung

**REQ-006 — „Mehr ›“.** Öffnet im selben Fenster das volle „Mit KI ausfüllen“ (Reiter „Websuche“
und „Prompt“, Links, Fotos, Schalter „Websuche“ und „Foto generieren“, Spec 0055); der Text steht
im Suchfeld und im Prompt, gewählt ist der Reiter des hervorgehobenen Wegs („KI-Rezept“ →
„Prompt“, sonst „Websuche“). Offline: nur online.

- AC-017: Angenommen „Meatball Pasta scharf ohne Sahne“ im Feld · Wenn ich „Mehr“ drücke · Dann
  ist „Prompt“ gewählt, der Text steht in „Was soll ins Rezept?“, und „Foto generieren“ ist da

**REQ-007 — Sammlung bleibt erreichbar.** „Sammlung“ wechselt das Fenster zu „Neue Sammlung“ mit
der Wahl „Rezept · Sammlung“, dem Titel und „Rezepte wählen“ wie bisher (Spec 0009, Spec 0037);
„Rezept“ wechselt zurück. Offline: nur online.

- AC-018: Angenommen „Neues Rezept“ · Wenn ich „Sammlung“ drücke, „Sonntag“ tippe und „Anlegen“
  drücke · Dann gibt es die Sammlung „Sonntag“

### Restaurant und Aktivität anlegen

**REQ-008 — Ein Feld, zwei Wege.** „+“ bei Restaurants und Aktivitäten öffnet zuerst dasselbe
Fenster mit einem Feld „Name oder Link“ bzw. „Name“ und den Knöpfen **Anlegen · Websuche**. Bis zu
4 Wörtern ist „Websuche“ hervorgehoben, sonst und bei einem Link „Anlegen“; Return nimmt den
hervorgehobenen Weg. „Anlegen“ zeigt im selben Fenster das Formular mit dem Namen (ein Kartenlink
wird gelesen wie bisher). „Websuche“ zeigt die Treffer im selben Fenster; „Übernehmen“ in der
Vorschau zeigt das ausgefüllte Formular, „Speichern“ speichert (Spec 0049, AC-015). Der leere
Zustand („Link einfügen“, „Von Hand anlegen“) und das Teilen eines Kartenlinks öffnen direkt das
Formular. Die Lupe neben „Name“ (Spec 0055, REQ-010) bleibt im Formular und bekommt das
Globus-Symbol der Websuche. Offline: nur online.

- AC-019: Angenommen Essen → Restaurants · Wenn ich „Restaurant anlegen“ drücke · Dann hat „Name
  oder Link“ den Cursor, darunter „Anlegen“ und „Websuche“
- AC-020: Angenommen „Coccodrillo“ im Feld · Wenn ich Return drücke · Dann wird nach „Coccodrillo“
  gesucht und die Treffer stehen im selben Fenster
- AC-021: Angenommen die Treffer aus AC-020 · Wenn ich einen öffne und „Übernehmen“ drücke · Dann
  zeigt das Fenster das Formular mit Name und Adresse des Treffers, gespeichert ist noch nichts
- AC-022: Angenommen „Pizzeria am Kanal mit Garten“ (5 Wörter) · Dann ist „Anlegen“ hervorgehoben,
  und Return zeigt das Formular mit diesem Namen
- AC-023: Angenommen ein Google-Maps-Link im Feld · Dann ist „Anlegen“ hervorgehoben
- AC-024: Angenommen Aktivitäten · Wenn ich „Aktivität anlegen“ drücke, „Kletterhalle“ tippe und
  „Anlegen“ drücke · Dann zeigt das Fenster das Formular mit dem Namen „Kletterhalle“
- AC-025: Angenommen das Formular „Restaurant hinzufügen“ · Dann hat der Knopf „Im Web suchen“
  neben „Name“ das Globus-Symbol

### Rezept mit KI ändern (E2)

**REQ-009 — ✨ auf der Rezeptseite.** Auf der Seite eines gespeicherten Rezepts steht in der
Kopfzeile neben dem Stift ✨ „Mit KI ändern“ (Handy: Symbol, ab Tablet mit Text). Es öffnet das
Fenster „Mit KI ändern“ mit den Reitern „Prompt“ (zuerst, Cursor im Feld „Was soll anders sein?“,
darunter die Chips „Web“ und „Bild“ und der Hauptknopf „Vorschlag“) und „Websuche“. „Web“ ist aus
und holt Kontext aus einer Websuche (Spec 0055, REQ-007); „Bild“ ist aus, wenn das Rezept ein Foto
hat, sonst an. Ein Rezept nur mit Titel öffnet auf „Websuche“ mit dem Titel (Spec 0055, REQ-005).
Nicht im Bearbeitungsmodus, nicht bei Sammlungen. Offline: nur online (✨ ausgegraut mit Hinweis).

- AC-026: Angenommen die Seite „Lasagne“ mit Zutaten und Foto · Wenn ich „Mit KI ändern“ drücke ·
  Dann ist „Prompt“ gewählt mit Cursor, „Web“ und „Bild“ sind aus
- AC-027: Angenommen „Chili con Carne“ mit Zutaten · Wenn ich „füge eine vegane Variante hinzu“
  tippe, „Web“ an und „Vorschlag“ drücke · Dann bekommt `ai-recipe-draft` das Rezept als
  `current`, den Satz als `text` und einen `webQuery`
- AC-028: Angenommen „Linsen-Dal“ nur mit Titel · Wenn ich „Mit KI ändern“ drücke · Dann ist
  „Websuche“ gewählt und das Suchfeld enthält „Linsen-Dal“
- AC-029: Angenommen offline oder die Seite im Bearbeitungsmodus · Dann ist „Mit KI ändern“
  deaktiviert bzw. nicht da

**REQ-010 — „Übernehmen“ speichert.** Der Vorschlag öffnet die Änderungsansicht (Spec 0049,
REQ-005) mit „Was soll noch anders sein?“ (Spec 0055, REQ-008). „Übernehmen“ speichert, was aktiv
ist, sofort (`save_recipe_page`, ein Schritt) und zeigt „Rezept geändert“ mit „Rückgängig“; es
gibt kein zweites „Speichern“. „Rückgängig“ speichert das Rezept wie vorher. Lässt sich der
Vorschlag nicht direkt speichern (eine Zutat ohne Artikel, offline, abgelehnt), öffnet der
Bearbeitungsmodus mit dem Vorschlag und dem Grund; nichts geht verloren. Offline: nur online
(„Rückgängig“ offline sagt den Offline-Hinweis).

- AC-030: Angenommen der Vorschlag „Vegan“ mit neuen Zeilen · Wenn ich „Übernehmen“ drücke · Dann
  ist das Rezept mit der Variante „Vegan“ gespeichert, die Seite liest (kein Bearbeitungsmodus),
  und der Hinweis „Rezept geändert“ hat „Rückgängig“
- AC-031: Angenommen AC-030 · Wenn ich „Rückgängig“ drücke · Dann hat das Rezept wieder genau
  Titel, Zutaten, Varianten und Schritte von vorher
- AC-032: Angenommen ich lasse eine neue Zeile mit × weg · Wenn ich „Übernehmen“ drücke · Dann ist
  sie nicht gespeichert
- AC-033: Angenommen der Vorschlag hat eine Zutat ohne Artikel · Wenn ich „Übernehmen“ drücke ·
  Dann öffnet der Bearbeitungsmodus mit dem Vorschlag und der orangen Zeile, nichts ist gespeichert
- AC-034: Angenommen das Speichern wird abgelehnt · Dann öffnet der Bearbeitungsmodus mit dem
  Vorschlag und der Meldung

**REQ-011 — Nur Änderungen; „Ergänzen · Ersetzen“ nur bei der Websuche.** Die Änderungsansicht
eines Rezepts zeigt nur neue, geänderte und entfernte Zeilen, keine unveränderten. Die Frage
„Ergänzen oder ersetzen?“ vor der Websuche entfällt; stattdessen steht im Vorschlag aus der
Websuche für ein Rezept mit Zutaten oben der Umschalter „Ergänzen · Ersetzen“ (Standard:
Ergänzen), der den Vorschlag neu vergleicht. Beim Prompt gibt es ihn nicht. Gilt für ✨ und für
„Mit KI ausfüllen“ im Bearbeitungsmodus. Offline: nur online.

- AC-035: Angenommen „Chili con Carne“ mit 8 Zutaten und ein Vorschlag, der eine hinzufügt · Dann
  zeigt die Änderungsansicht nur die neue Zeile
- AC-036: Angenommen „Mit KI ändern“ → „Websuche“ bei einem Rezept mit Zutaten · Wenn ich einen
  Treffer übernehme · Dann steht im Vorschlag „Ergänzen · Ersetzen“ auf „Ergänzen“, und „Ersetzen“
  zeigt die alten Zutaten als entfernt
- AC-037: Angenommen ein Vorschlag aus „Prompt“ · Dann gibt es keinen Umschalter „Ergänzen ·
  Ersetzen“

**REQ-012 — Fotovorschläge nach ✨.** War „Bild“ an, stehen die drei Fotovorschläge (Spec 0045) oben
auf der lesenden Seite; „Übernehmen“ speichert das gewählte Foto sofort („Foto gespeichert“),
„Ausblenden“ schließt sie ohne Foto. Offline: nur online.

- AC-038: Angenommen drei Fotovorschläge auf der lesenden Seite · Wenn ich den zweiten wähle und
  „Übernehmen“ drücke · Dann ist er das Foto des Rezepts und die Vorschläge sind weg

## Entscheidungen

1. **Regel der Hervorhebung in core** (`suggestedCreatePath`): Wörter = Teile zwischen
   Leerzeichen mit einem Buchstaben oder einer Ziffer. Rezept: Link, Ziffer oder ≥ 4 Wörter → KI,
   sonst Websuche. Orte: Link oder > 4 Wörter → Anlegen, sonst Websuche (Konzept: „bis zu 4
   Wörtern“). Grund: eine Regel, einmal getestet, für beide Fenster.
2. **Fensterkopf mit ✕ statt „Abbrechen · Hauptknopf“** im Ein-Feld-Fenster (DESIGN.md
   „Bedienmuster“): Die drei Knöpfe sind die Aktionen; ein vierter benannter Knopf oben wäre
   doppelt. Sobald eine Vorschau „Übernehmen“ braucht, „Mehr“ oder „Sammlung“ offen ist, bekommt
   das Fenster wieder `actions`.
3. **Ein Fenster, Zustände statt neuer Fenster:** „Neues Rezept“ hat die Zustände „schnell“,
   „Mehr“ und „Sammlung“; das Restaurant- und Aktivitätsfenster „Start“ und „Formular“. Grund:
   Konzept („kein Sprung in ein zweites Fenster“), Adresse und Fokus bleiben wie bisher.
4. **Ersetzt:** Spec 0054, REQ-002/AC-005 (die Wahl „Rezept · Sammlung“ steht nicht mehr vorne,
   sondern hinter „Sammlung“); Spec 0037, REQ-002 (Titel als erstes Feld, „Mit KI ausfüllen“ als
   Link) und Spec 0055, AC-001/AC-017 nur für das Fenster „Neu“ (dort gibt es kein „Mit KI
   ausfüllen“ mehr, sondern „KI-Rezept“, „Websuche“ und „Mehr“); Spec 0049, REQ-001 („Websuche
   immer vorgewählt“ gilt nur noch hinter „Mehr“) und **Spec 0049, REQ-005** sowie Spec 0040,
   AC-006 und Spec 0055, AC-020 (die Frage „Ergänzen oder ersetzen?“ wird zum Umschalter im
   Vorschlag, nur bei der Websuche); Spec 0049, REQ-005 außerdem: unveränderte Zeilen eines Rezepts
   stehen nicht mehr in der Änderungsansicht; Spec 0049, Entscheidung 6 für ✨ (dort speichert
   „Übernehmen“); Spec 0055, REQ-010 (Lupe → Globus, beim Anlegen erst das Ein-Feld-Fenster).
5. **Direktes Speichern über den Bearbeitungsmodus-Hook:** `usePageEditor` bekommt `apply(draft)`
   = derselbe Weg wie „Speichern“ (`saveRecipePage`), aber ohne den Bearbeitungsmodus zu öffnen;
   bei Problemen öffnet er ihn mit dem Entwurf. Grund: ein Speicherweg, gleiche Fehlerfälle.
6. **„Rückgängig“ als neuer Entwurf** (core `revertPageDraft`): die Seite, wie sie jetzt
   gespeichert ist, mit den Werten von vorher; eine Zeile, die es nicht mehr gibt, kommt als neue
   Zeile zurück. Grund: geht über denselben geprüften Speicherweg mit `seenUpdatedAt`; neu
   angelegte Artikel bleiben (markiert „Neu aus Rezepten“), ein Foto bleibt (Nicht-Ziel).
7. **„Bild“ und „Web“ als Chips** (Konzept E2) statt der Schalter-Zeilen von Spec 0055 im Fenster
   „Mit KI ändern“; Fotos und Bildadresse gibt es dort nicht (dafür „Mit KI ausfüllen“ im
   Bearbeitungsmodus, unverändert bis auf REQ-011).
8. **Desktop-Knopf „Mit KI ändern“** als `ghost`-Knopf mit Text neben dem Stift, Handy nur ✨ —
   wie das Konzept; keine Akzentfarbe (Bedienmuster „Akzent“).

## Daten

Keine Schema-Änderung. Gelesen und geschrieben wird wie bisher: `createRecipe`,
`createRecipeWithIngredients`, `createCollection`, `saveRecipePage` (RPC `save_recipe_page`),
`setRecipePhoto`; ans Sprachmodell und an die Suche gehen dieselben Daten wie Spec 0049/0055.

## Umsetzung

- [x] 1. core: `suggestedCreatePath` (AC-003 – AC-008, AC-022, AC-023), `revertPageDraft`
      (AC-031), Vitest rot → grün
- [x] 2. ui: `PathButtons` (AC-001, AC-002, Hervorhebung), Icon `globe`, Vitest rot → grün
- [x] 3. App: „Neues Rezept“ mit drei Wegen, „Mehr“, „Sammlung“ (AC-001 – AC-018)
- [x] 4. App: Restaurant und Aktivität mit Start-Schritt, Globus (AC-019 – AC-025)
- [x] 5. App: ✨ „Mit KI ändern“, `apply` mit „Rückgängig“, Umschalter, nur Änderungen,
      Fotovorschläge auf der lesenden Seite (AC-026 – AC-038)
- [x] 6. e2e `e2e/rundgang-anlegen-0062.spec.ts` (KI und Suche mit `page.route`), bestehende e2e
      auf die neuen Wege angepasst, Glossar
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün, Screenshots in
      `tmp/review-0004/0062/`

### Nachweis

(folgt)
