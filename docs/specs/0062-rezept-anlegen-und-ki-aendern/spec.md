---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-27
---

# 0062 — Rezept anlegen und mit KI ändern

**Quelle:** Enricos Review 0004 vom 27.11.2026 („Rezept erstellen“, „Rezept bearbeiten“,
„Aktivität/Restaurant anlegen“), das freigegebene Konzept `tmp/review-0004/konzept-anlegen/KONZEPT.md`
(Anlegen = Variante A, Bearbeiten = E2, Variante C nicht) und Enricos Rückmeldung zum ersten Bau
am 27.11.2026 (Entscheidung 1). Baut auf Spec 0054 (Bedienmuster) und Spec 0055 (KI-Fenster v3)
auf. **Kritischer Pfad:** nein (keine Datenbank-, Rechte- oder Sync-Änderung; gespeichert wird über
die vorhandenen Wege `createRecipe` und `save_recipe_page`).

## Ziel

Ich tippe auf „+“, schreibe einen Titel und habe alle Wege vorn: die Lupe im Feld sucht das Rezept
im Web, „Anlegen“ oben legt es mit dem Titel an, der Reiter „KI-Rezept“ lässt es mir schreiben. Ein
Restaurant oder eine Aktivität lege ich genauso an: Name, Lupe, „Anlegen“. Ein vorhandenes Rezept
ändere ich mit ✨ direkt von seiner Seite: Wunsch tippen, Vorschlag prüfen, „Übernehmen“ – gespeichert,
mit „Rückgängig“.

## Nicht-Ziele

- Keine Variante C (Anlegen aus der Rezeptsuche) und kein E1 (KI-Zeile im Bearbeitungsmodus).
- Keine Reihe großer Wege-Knöpfe und keine wandernde Hervorhebung (erster Bau, verworfen:
  Entscheidung 1).
- Kein ✨ „Mit KI ändern“ auf der Seite eines Restaurants oder einer Aktivität; dort bleibt „Im Web
  suchen“ im Formular „bearbeiten“ (Spec 0055).
- Keine weiteren Änderungen an der Rezeptseite: Aktionen, „+ Zutat“, Galerie, ⋯ gehören Spec 0056
  bzw. 0054. Hier nur der ✨-Einstieg in der Kopfzeile und die Fotovorschläge nach ✨ (REQ-010).
- Kein Rückgängig für ein übernommenes Foto (REQ-008): es nimmt nur Text, Zutaten, Varianten,
  Schritte, Einordnung und Links zurück.
- Keine Änderung an Datenbank, Edge Functions oder Vertrag.

## Anforderungen

### Rezept anlegen: das Fenster „Neu“

**REQ-001 — Fensterkopf wie die anderen Fenster.** „+“ im Tab „Rezepte“ (`CreateButton` „Rezept
anlegen“, Spec 0054) öffnet „Neu“: am Handy oben „Abbrechen · Neu · Anlegen“, ab Tablet „Anlegen“
unten (Bedienmuster „Fensterkopf“, Spec 0054). Darunter die Reiter „Websuche“ (Standard) und
„KI-Rezept“, ganz unten leise „Foto“, „Zutaten einfügen“ und „Sammlung“. Keine Reihe großer
Aktionsknöpfe. Ohne KI-Schalter (`features.aiRecipes`) nur der Titel. Offline: nur online
(„Anlegen“, Lupe und „Erzeugen“ ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“).

- AC-001: Angenommen Essen → Rezepte · Wenn ich „Rezept anlegen“ drücke · Dann ist „Neu“ offen mit
  „Websuche“ gewählt, „Titel“ hat den Cursor, „Anlegen“ steht im Fensterkopf, und es gibt keinen
  Knopf „KI-Rezept“ (nur den Reiter)
- AC-002: Angenommen offline · Dann sind „Anlegen“ und die Lupe deaktiviert und sagen den Hinweis

**REQ-002 — Reiter „Websuche“ und „KI-Rezept“.** Der zweite Reiter heißt im Fenster „Neu“
„KI-Rezept“, weil die KI hier ein ganzes Rezept schreibt; in „Mit KI ausfüllen“ und „Mit KI ändern“
bleibt „Prompt“ (Spec 0055, REQ-004), weil dort ein vorhandenes Rezept geändert wird. Cursor,
Tastatur und Wischen wie Spec 0055, REQ-001/REQ-002. Offline: nur online.

- AC-003: Angenommen „Neu“ ist offen · Dann heißen die Reiter „Websuche“ und „KI-Rezept“
- AC-004: Angenommen „Neu“ auf „Websuche“ · Wenn ich auf „KI-Rezept“ tippe · Dann hat „Was soll ins
  Rezept?“ den Cursor und „Foto generieren“ ist an

**REQ-003 — Reiter „Websuche“: Titel mit Lupe.** Das Feld „Titel“ hat rechts eine Lupe („Im Web
suchen“). Die Lupe und Return suchen den Titel im Web (nur dann, nie beim Tippen); die Tastatur geht,
die Treffer stehen darunter im selben Fenster, und ab dem Treffer läuft alles wie Spec 0049
(Vorschau → „Übernehmen“ im Fensterkopf → Rezeptseite im Bearbeitungsmodus → „Speichern“).
„Anlegen“ speichert sofort ein Rezept mit dem Titel und öffnet es; ohne Titel steht „Titel fehlt“
am Feld (aus „KI-Rezept“ wechselt das Fenster dafür zu „Websuche“). Ein allein eingefügter Link geht
in „KI-Rezept“, das die Seite liest (Spec 0049, AC-002). Offline: nur online.

- AC-005: Angenommen „Spaghetti Bolognese“ getippt · Wenn ich Return drücke · Dann wird genau
  einmal nach „Spaghetti Bolognese“ gesucht (beim Tippen keinmal), und die Treffer stehen im Fenster
- AC-006: Angenommen „Lasagne“ im Titel · Wenn ich die Lupe tippe · Dann wird nach „Lasagne“
  gesucht
- AC-007: Angenommen die Treffer aus AC-005 · Wenn ich den ersten öffne und „Übernehmen“ drücke ·
  Dann ist die Rezeptseite im Bearbeitungsmodus mit dem Rezept des Treffers, noch nicht gespeichert
- AC-008: Angenommen „Linsen-Dal“ im Titel · Wenn ich „Anlegen“ drücke · Dann gibt es das Rezept
  „Linsen-Dal“ und seine Seite ist offen
- AC-009: Angenommen „Websuche“ gewählt, kein Titel · Wenn ich „Anlegen“ drücke · Dann steht am
  Titel „Titel fehlt“, nichts ist gespeichert („KI-Rezept“ hat seit REQ-004 kein „Anlegen“ mehr,
  nur „Erzeugen“; e2e-Review 27.11.2026)
- AC-010: Angenommen ich füge „https://www.chefkoch.de/rezepte/1/bolognese.html“ in den Titel ein ·
  Dann ist „KI-Rezept“ gewählt und der Link steht in „Was soll ins Rezept?“

**REQ-004 — Reiter „KI-Rezept“.** Das Feld von Spec 0040 (Diktat, bis zu 3 Links, 4 Fotos, Schalter
„Websuche“ und „Foto generieren“, an). Der Fensterkopf sagt hier „Erzeugen“ statt „Anlegen“ (am Desktop
unten rechts), einen zweiten Knopf darunter gibt es nicht (Rückmeldung Enrico, 27.11.2026). Ein
getippter Titel geht als „Titel: …“ mit und bleibt der Titel. Bis zur Antwort pulsieren Platzhalter
(Spec 0055, REQ-003); danach öffnet die Rezeptseite im Bearbeitungsmodus mit dem Entwurf (Spec
0040, AC-001). Scheitert es, bleibt der Wunsch mit dem Hinweis stehen. Offline: nur online.

- AC-011: Angenommen „scharf, ohne Sahne, für 4“ in „KI-Rezept“ · Wenn ich „Erzeugen“
  im Fensterkopf drücke · Dann bekommt `ai-recipe-draft` den Wunsch mit `imagePrompt: true`, und danach ist die
  Rezeptseite im Bearbeitungsmodus
- AC-012: Angenommen der Titel „Meatball Pasta“ aus AC-011 · Dann geht „Titel: Meatball Pasta“ vor
  dem Wunsch mit, und der Entwurf heißt „Meatball Pasta“
- AC-013: Angenommen die KI ist nicht erreichbar · Wenn ich „Erzeugen“ drücke · Dann bleibt
  das Fenster mit dem Wunsch offen und darunter steht der Hinweis der KI-Störung
- AC-014: Angenommen „KI-Rezept“ ohne Wunsch, Link oder Foto · Dann ist „Erzeugen“
  deaktiviert, und weder „Anlegen“ noch ein zweiter Knopf stehen da
- AC-031: Angenommen „Neu“ auf „KI-Rezept“ · Dann steht „Foto generieren“ über „Websuche“ · Und
  mit „Websuche“ an steht die Wahl „Foto: Original · KI-Bild · Keins“ an dieser Stelle über dem
  Schalter (Entscheidung 13)

**REQ-005 — Sammlung bleibt erreichbar.** „Sammlung“ wechselt das Fenster zur Wahl „Rezept ·
Sammlung“ mit Titel und „Rezepte wählen“ wie bisher (Spec 0009, Spec 0037). Offline: nur online.

- AC-015: Angenommen „Neu“ · Wenn ich „Sammlung“ drücke, „Sonntag“ tippe und „Anlegen“ drücke ·
  Dann gibt es die Sammlung „Sonntag“

### Restaurant und Aktivität anlegen

**REQ-006 — Dasselbe Muster ohne Reiter.** „+“ bei Restaurants und Aktivitäten öffnet das Formular
mit dem Cursor im Namen; rechts im Namen steht die Lupe „Im Web suchen“ (Spec 0055, REQ-010), der
Hauptknopf im Fensterkopf heißt beim Anlegen „Anlegen“ (beim Bearbeiten weiter „Speichern“).
Offline: nur online.

- AC-016: Angenommen Essen → Restaurants · Wenn ich „Restaurant anlegen“ drücke · Dann hat „Name“
  den Cursor, die Lupe steht im Feld, und der Hauptknopf heißt „Anlegen“
- AC-017: Angenommen Aktivitäten · Wenn ich „Aktivität anlegen“ drücke · Dann ebenso; „Aktivität
  bearbeiten“ heißt weiter „Speichern“

### Rezept mit KI ändern (E2)

**REQ-007 — ✨ auf der Rezeptseite.** Auf der Seite eines gespeicherten Rezepts steht in der
Kopfzeile neben dem Stift ✨ „Mit KI ändern“ (Handy: Symbol, ab Tablet mit Text als `ghost`-Knopf).
Es öffnet das Fenster „Mit KI ändern“ mit dem Fensterkopf „Abbrechen · Mit KI ändern · Vorschlag“
(ab Tablet unten) und den Reitern „Prompt“ (zuerst, Cursor im Feld „Was soll anders sein?“,
darunter die Chips „Web“ und „Bild“) und „Websuche“. „Web“ ist aus und holt Kontext aus einer
Websuche (Spec 0055, REQ-007); „Bild“ ist aus, wenn das Rezept ein Foto hat, sonst an. Ein Rezept nur
mit Titel öffnet auf „Websuche“ mit dem Titel (Spec 0055, REQ-005). Nicht im Bearbeitungsmodus,
nicht bei Sammlungen. Offline: nur online (✨ ausgegraut mit Hinweis).

- AC-018: Angenommen die Seite „Lasagne“ mit Zutaten und Foto · Wenn ich „Mit KI ändern“ drücke ·
  Dann ist „Prompt“ gewählt mit Cursor, „Web“ und „Bild“ sind aus
- AC-019: Angenommen „Chili con Carne“ mit Zutaten · Wenn ich „füge eine vegane Variante hinzu“
  tippe und „Vorschlag“ drücke · Dann bekommt `ai-recipe-draft` das Rezept als `current` und den
  Satz als `text`
- AC-020: Angenommen „Linsen-Dal“ nur mit Titel · Wenn ich „Mit KI ändern“ drücke · Dann ist
  „Websuche“ gewählt und das Suchfeld enthält „Linsen-Dal“
- AC-021: Angenommen die Seite im Bearbeitungsmodus · Dann gibt es kein „Mit KI ändern“

**REQ-008 — „Übernehmen“ speichert.** Der Vorschlag öffnet die Änderungsansicht (Spec 0049,
REQ-005) mit „Was soll noch anders sein?“ (Spec 0055, REQ-008); „Übernehmen“ steht im Fensterkopf
(ab Tablet unten). Es speichert, was aktiv ist, sofort (`save_recipe_page`, ein Schritt) und zeigt
„Rezept geändert“ mit „Rückgängig“; es gibt kein zweites „Speichern“. „Rückgängig“ speichert das
Rezept wie vorher. Lässt sich der Vorschlag nicht direkt speichern (eine Zutat ohne Artikel,
offline, abgelehnt), öffnet der Bearbeitungsmodus mit dem Vorschlag und dem Grund; nichts geht
verloren. Offline: nur online („Rückgängig“ offline sagt den Offline-Hinweis).

- AC-022: Angenommen der Vorschlag „Vegan“ mit neuen Zeilen · Wenn ich „Übernehmen“ drücke · Dann
  ist das Rezept mit der Variante „Vegan“ gespeichert, die Seite liest (kein Bearbeitungsmodus),
  und der Hinweis „Rezept geändert“ hat „Rückgängig“
- AC-023: Angenommen AC-022 · Wenn ich „Rückgängig“ drücke · Dann hat das Rezept wieder genau
  Titel, Zutaten, Varianten und Schritte von vorher
- AC-024: Angenommen ich lasse eine neue Zeile mit × weg · Wenn ich „Übernehmen“ drücke · Dann ist
  sie nicht gespeichert
- AC-025: Angenommen der Vorschlag hat eine Zutat ohne Artikel · Wenn ich „Übernehmen“ drücke ·
  Dann öffnet der Bearbeitungsmodus mit dem Vorschlag und der orangen Zeile, nichts ist gespeichert
  (entfällt in der Praxis: jede Zeile eines KI-Vorschlags hat einen Artikel, ein unbekannter Name
  wird beim Speichern neu angelegt, Spec 0055 REQ-009; der Weg in den Bearbeitungsmodus ist AC-026;
  e2e-Review 27.11.2026)
- AC-026: Angenommen das Speichern wird abgelehnt · Dann öffnet der Bearbeitungsmodus mit dem
  Vorschlag und der Meldung
- AC-032: Angenommen der Vorschlag in „Mit KI ändern“ · Dann ist „Was soll noch anders sein?“ ein
  rundes Feld mit Mikrofon und dem Senden-Symbol „Anpassen“ darin, ohne Text-Knopf · Und das Symbol
  ist leer und während die KI anpasst deaktiviert (Entscheidung 14)
- AC-033: Angenommen das Feld aus AC-032 · Wenn ich mehr als eine Zeile tippe · Dann wächst es bis
  auf vier Zeilen · Und nach dem Senden ist es wieder eine Zeile hoch (Entscheidung 14)

**REQ-009 — Nur Änderungen; „Ergänzen · Ersetzen“ nur bei der Websuche.** Die Änderungsansicht
eines Rezepts zeigt nur neue, geänderte und entfernte Zeilen, keine unveränderten. Die Frage
„Ergänzen oder ersetzen?“ vor der Websuche entfällt; stattdessen steht im Vorschlag aus der
Websuche für ein Rezept mit Zutaten oben der Umschalter „Ergänzen · Ersetzen“ (Standard:
Ergänzen), der den Vorschlag neu vergleicht. Beim Prompt gibt es ihn nicht. Gilt für ✨ und für
„Mit KI ausfüllen“ im Bearbeitungsmodus. Offline: nur online.

- AC-027: Angenommen ein Rezept mit 2 Zutaten und ein Vorschlag, der eine hinzufügt · Dann zeigt die
  Änderungsansicht nur die neue Zeile
- AC-028: Angenommen „Mit KI ändern“ → „Websuche“ bei einem Rezept mit Zutaten · Wenn ich einen
  Treffer übernehme · Dann steht im Vorschlag „Ergänzen · Ersetzen“ auf „Ergänzen“, und „Ersetzen“
  zeigt die alten Zutaten als entfernt
- AC-029: Angenommen ein Vorschlag aus „Prompt“ · Dann gibt es keinen Umschalter „Ergänzen ·
  Ersetzen“

**REQ-010 — Fotovorschläge nach ✨.** War „Bild“ an, stehen die drei Fotovorschläge (Spec 0045) oben
auf der lesenden Seite; „Übernehmen“ speichert das gewählte Foto sofort („Foto gespeichert“),
„Ausblenden“ schließt sie ohne Foto. Offline: nur online.

- AC-030: Angenommen drei Fotovorschläge auf der lesenden Seite · Wenn ich den zweiten wähle und
  „Übernehmen“ drücke · Dann ist er das Foto des Rezepts und die Vorschläge sind weg

## Entscheidungen

1. **Rückmeldung des Inhabers 27.11.:** „Ich will nicht so fette Buttons und der Anlegen-Button
   gehört da nicht hin … Abbrechen und Anlegen wie vorher war doch super!“ Darum ist Variante A
   umgebaut: Fensterkopf „Abbrechen · Neu · Anlegen“ statt der Reihe „Anlegen · Websuche ·
   KI-Rezept“, zwei Reiter statt wandernder Hervorhebung, die Websuche als Lupe im Titel, „Rezept
   erzeugen“ als normal großer Knopf. Die Kachel-Bausteine (`PathButtons`, `suggestedCreatePath`)
   und der Start-Schritt bei Restaurant/Aktivität aus dem ersten Bau sind wieder entfernt.
2. **„KI-Rezept“ nur im Fenster „Neu“:** Dort entsteht ein ganzes Rezept; in „Mit KI ausfüllen“ und
   „Mit KI ändern“ ändert der Reiter ein vorhandenes Rezept und heißt weiter „Prompt“ (Spec 0055,
   REQ-004). Im Code bleibt der Wert `prompt` (`AiFillTab`).
3. **Die Lupe sucht nach dem Titel, nicht in einem eigenen Suchfeld:** Der Titel ist die Suche
   (Spec 0049 füllte das Suchfeld ohnehin mit dem Titel). Die Lupe ist eine `IconButton` im Feld
   wie bei Restaurant/Aktivität (Spec 0055, REQ-010).
4. **„Anlegen“ bleibt im Kopf, auch auf „KI-Rezept“;** in einer Vorschau wird es „Übernehmen“
   (Spec 0049). Ohne Titel springt das Fenster zu „Websuche“ und zeigt „Titel fehlt“.
5. **Restaurant und Aktivität ohne Reiter:** Ihr Formular hat die Lupe am Namen schon (Spec 0055);
   neu ist nur der Name des Hauptknopfs „Anlegen“ beim Anlegen.
6. **Ersetzt:** Spec 0037, REQ-002 und Spec 0055, AC-001/AC-017 für das Fenster „Neu“ (statt „Mit
   KI ausfüllen“ als Link stehen die Reiter „Websuche · KI-Rezept“ immer da; die Websuche nutzt den
   Titel); Spec 0054, AC-005 (die Wahl „Rezept · Sammlung“ steht hinter „Sammlung“); **Spec 0049,
   REQ-005** sowie Spec 0040, AC-006 und Spec 0055, AC-020 (die Frage „Ergänzen oder ersetzen?“
   wird zum Umschalter im Vorschlag, nur bei der Websuche); Spec 0049, REQ-005 außerdem:
   unveränderte Zeilen eines Rezepts stehen nicht mehr in der Änderungsansicht; Spec 0049,
   Entscheidung 6 für ✨ (dort speichert „Übernehmen“).
7. **Direktes Speichern über den Bearbeitungsmodus-Hook:** `usePageEditor` bekommt `apply(draft)` =
   derselbe Weg wie „Speichern“ (`saveRecipePage`), aber ohne den Bearbeitungsmodus zu öffnen; bei
   Problemen öffnet er ihn mit dem Entwurf. Grund: ein Speicherweg, gleiche Fehlerfälle.
8. **„Rückgängig“ als neuer Entwurf** (core `revertPageDraft`): die Seite, wie sie jetzt gespeichert
   ist, mit den Werten von vorher; eine Zeile, die es nicht mehr gibt, kommt als neue Zeile zurück.
   Grund: geht über denselben geprüften Speicherweg mit `seenUpdatedAt`; neu angelegte Artikel
   bleiben (markiert „Neu aus Rezepten“), ein Foto bleibt (Nicht-Ziel).
9. **„Web“ und „Bild“ als Chips** (Konzept E2) statt der Schalter-Zeilen von Spec 0055 im Fenster
   „Mit KI ändern“; Fotos und Bildadresse gibt es dort nicht (dafür „Mit KI ausfüllen“ im
   Bearbeitungsmodus, unverändert bis auf REQ-009). Die Aktionen von „Mit KI ändern“ und der
   Änderungsansicht stehen im Fensterkopf bzw. ab Tablet unten wie überall (`Sheet actions`), keine
   eigenen großen Knöpfe.
10. **Fensterköpfe bleiben `Sheet actions`:** „ab Tablet unten“ ist die vorhandene Fußzeile der
    Fenster (Spec 0032, REQ-003; Spec 0054); hier wird kein neues Layout dafür gebaut. „Neu“ gibt
    „Abbrechen“ ausdrücklich an, damit ab Tablet unten „Abbrechen“ links und „Anlegen“ rechts steht
    statt eines Knopfs über die ganze Breite (Test-ID `new-recipe-cancel`).
11. Durchklick 27.11. (Koordinator): Im Reiter „KI-Rezept“ fehlt der Link „Foto“ (Foto des
    Rezepts); dort sind die Fotos für die KI und „Foto generieren“ der Weg. Im Reiter „Websuche“
    bleibt er. Zeigt „Websuche“ die Vorschau eines Treffers, fehlen „Foto“, „Zutaten einfügen“ und
    „Sammlung“: „Übernehmen“ nimmt Foto und Zutaten des Treffers, die Links gingen nicht mit.
12. Nachklick 27.11. (Befunde `tmp/review-0004/durchklick/nach-desktop.md` N-xx, `nach-iphone.md`
    iN-xx):
    - **N-01/iN-01:** Die Änderungsansicht zeigt Zutaten und Schritte unter „Alle Varianten“, je
      Variante und je Gruppe wie die Rezeptseite. Eine Zeile, die nur in eine Variante oder Gruppe
      wandert (z. B. in die neue Variante „Original“), ist eine geänderte Zeile mit „jetzt nur in
      „Original““ bzw. „jetzt unter „Soße““ statt „entfernt“ + „neu“ (core `diffRowChanges` mit
      `loose`/`hint`, `recipeProposal` mit `section`). Eine Gruppe, die sich ändert, wird jetzt auch
      gespeichert (vorher galt die Zeile als gleich). Die KI-Anweisung beim Ändern: genau eine
      Variante mehr; die bisherige Fassung heißt „Original“ und trägt nur die ersetzten Zeilen; ein
      Hinweis an einer gemeinsamen Zutat nennt nie eine Variante, eine andere Sorte bekommt eine
      eigene Zeile der Variante. Geprüft am Desktop-Befund (Shakshuka): die KI hing nur Eier und
      Feta um, das war richtig; falsch war die Anzeige. Beim iPhone-Befund (Lasagne) nannte sie die
      bisherige Fassung „Vegetarisch“ und schrieb „für die vegane Variante“ an eine gemeinsame Zeile.
    - **N-04:** Return in „Name“ von „Restaurant/Aktivität anlegen“ sucht wie die Lupe im Web, statt
      sofort anzulegen; Bearbeiten unverändert (dort keine Lupe).
    - **N-06:** Das Fenster „Neu“ hat immer die Größe `l`, auch leer und als Sammlung; es springt beim
      Reiterwechsel und beim ersten Suchen nicht mehr.
    - **N-07:** Scheitert die Websuche in „Neu“, nennt der Hinweis den Reiter „KI-Rezept“.
    - **N-09:** Titel „Restaurant anlegen“; Toast „Restaurant/Aktivität angelegt“ beim Anlegen,
      „gespeichert“ beim Bearbeiten.
    - **N-12:** „Zutaten einfügen“ gibt dem Feld den Cursor (im Tipp, auch am iPhone) und holt es ins
      Bild. Eingefügte Zutaten allein schalten „Erzeugen“ frei (sie gehen als „Zutaten: …“ an die KI).
    - **N-13:** Die Rückfrage beim Schließen von „Neu“ und beim Abbrechen eines noch nicht
      gespeicherten Rezepts (Treffer „Übernehmen“) heißt „Entwurf verwerfen?“.
    - **N-17:** „Vorschlag prüfen“ fragt vor „Abbrechen“, Escape oder ✕ „Vorschlag verwerfen?“ (Weiter
      prüfen · Verwerfen): der Vorschlag hat eine KI- oder Suchanfrage gekostet. „Mit KI ändern“ fragt
      mit getipptem Wunsch „Änderungen verwerfen?“ wie „Neu“.
    - **iN-06:** „Anlegen“ ohne Titel gibt dem Titel den Cursor im Tipp: die Tastatur bleibt, das
      Fenster sackt nicht ab.
    - **Rückgängig:** „Rezept geändert · Rückgängig“ nach „Übernehmen“ steht 10 s statt 5 s. Grund:
      man prüft die übernommene KI-Änderung erst auf der Seite; ein zweiter Weg zum Zurücknehmen wäre
      ein neues Bedienelement für einen seltenen Fall.
13. Vorschau-Review 27.11.2026 (Review 0004, Enrico): Im Feld von „KI-Rezept“ steht „Foto
    generieren“ über „Websuche“ (AC-031). Mit „Websuche“ an nimmt die Fotowahl (Spec 0065, REQ-002)
    den Platz von „Foto generieren“ ein, also ebenfalls über dem Schalter: So bleibt „Websuche“
    beim Umschalten unter dem Finger stehen. Das Feld ist dasselbe wie im Reiter „Prompt“ von „Mit
    KI ändern“ und „Mit KI ausfüllen“; die Reihenfolge gilt dort genauso.
14. Vorschau-Review 27.11.2026 (Review 0004, Enrico: die Zeile wirkte gequetscht): „Was soll noch
    anders sein?“ (Spec 0055, REQ-008) ist ein Eingabefeld wie beim Assistenten: rund, volle Breite,
    eine Zeile, die bis vier Zeilen wächst (`TextField grow`), darin rechts das Mikrofon und das
    Senden-Symbol (`send`, gefüllt, Name „Anpassen“) statt „✨ Anpassen“ als Text-Knopf (AC-032,
    AC-033). Return sendet, Umschalt+Return am Desktop macht eine neue Zeile. Am Handy und am
    Desktop gleich. Fortschritt zeigen weiter die Ladezeilen darunter. „Was soll anders sein?“ bei
    den Fotovorschlägen ist kein solches Feld (optionaler Zusatz zu „Neu generieren“, leer erlaubt)
    und bleibt; der Assistent hat schon dieses Muster (`TextField round` mit „Senden“).

## Daten

Keine Schema-Änderung. Gelesen und geschrieben wird wie bisher: `createRecipe`,
`createRecipeWithIngredients`, `createCollection`, `saveRecipePage` (RPC `save_recipe_page`),
`setRecipePhoto`; ans Sprachmodell und an die Suche gehen dieselben Daten wie Spec 0049/0055.

## Umsetzung

- [x] 1. core: `revertPageDraft` (AC-023), Vitest rot → grün
- [x] 2. App: „Neu“ mit Kopf „Anlegen“, Reitern „Websuche · KI-Rezept“, Lupe im Titel, „Rezept
      erzeugen“, „Sammlung“ (AC-001 – AC-015)
- [x] 3. App: Restaurant und Aktivität „Anlegen“ im Kopf (AC-016, AC-017)
- [x] 4. App: ✨ „Mit KI ändern“, `apply` mit „Rückgängig“, Umschalter, nur Änderungen,
      Fotovorschläge auf der lesenden Seite (AC-018 – AC-030)
- [x] 5. e2e `e2e/rundgang-anlegen-0062.spec.ts` (KI und Suche mit `page.route`), bestehende e2e
      angepasst, Glossar, DESIGN.md
- [x] Nachweis: `pnpm format:check && pnpm check` grün, Screenshots in `tmp/review-0004/0062/`

### Nachweis

- Rot vor Grün (Vitest, 27.11.2026): `packages/core/src/page-editor.test.ts` 3 rot
  (`revertPageDraft is not a function`), danach grün. Der Umbau nach Entscheidung 1 ist reine
  App-Zusammensetzung (Reiter, Feld, Knöpfe); er ist mit e2e abgedeckt.
- `pnpm format:check && pnpm check` grün (Lint, Typen inkl. e2e, Unit-Tests, knip). `pnpm
build:web` bündelt lokal; der letzte Schritt braucht `EXPO_PUBLIC_SUPABASE_URL` (in der CI
  gesetzt).
- e2e `e2e/rundgang-anlegen-0062.spec.ts` geschrieben, bestehende e2e angepasst
  (`rundgang-essen`, `-bedienmuster-0054`, `-ki-fenster-0055`); nicht lokal gelaufen (setzt die DB
  zurück).
- Screenshots (eigener Dev-Server, Functions mit `page.route`, nichts gespeichert):
  `tmp/review-0004/0062/`, Desktop 1440×900 und Handy 390×844.
