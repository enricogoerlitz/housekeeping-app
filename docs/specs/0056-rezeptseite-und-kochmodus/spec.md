---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-27
---

# 0056 — Rezeptseite und Kochmodus

**Quelle:** Enricos Review 0004 vom 27.11.2026 (Rezept bearbeiten: „+ Zutat / Link direkt
übernehmen“, „mehrere hinzufügen direkt sehen“; Rezept-View: „im Vollbild swipen“), UI/UX-Review
vom 27.11. (Befund 4 Rezeptseite am Handy, Befund 8 Kochmodus) und Review „Ausbau bestehend“
(Top 1 Timer-Ton, Top 2 „Fertig“ → gekocht, Top 3 Entwurf sichern = Spec 0037, OFFEN 12); Paket 1
von Enrico freigegeben. Vorgänger: Specs 0023, 0037, 0046, 0047, 0050. **Kritischer Pfad:** nein
(keine Migration, kein neuer Schreibweg: gespeichert wird über die vorhandenen Befehle
`saveRecipePage` und `addPlanEntry`).

## Ziel

Auf der Rezeptseite füge ich eine Zutat, mehrere Zutaten oder einen Link hinzu, ohne danach noch
einmal das ganze Rezept speichern zu müssen. Am Handy erreiche ich „Kochen“, „Einplanen“ und „Auf
die Liste“ ohne zu scrollen, und ein Rezept ohne Foto verschenkt keinen halben Bildschirm. Im
Vollbild wische ich vom Foto zu den Videos und zurück. Ungespeicherte Änderungen gehen nicht mehr
still verloren. Im Kochmodus höre bzw. spüre ich, wenn ein Timer abläuft, und „Fertig“ trägt das
Kochen auf Wunsch im Kalender ein, damit „Zuletzt gekocht“ stimmt.

## Nicht-Ziele

- Kopfzeile und ⋯-Menü der Rezeptseite (Spec 0054), KI-Fenster (Spec 0055), Übersicht, Tab-Leiste
  und Silbentrennung (Spec 0057), Themes (Spec 0058) bleiben unberührt.
- Die Bearbeiten-Ansicht (Stift oben) bleibt, wie sie ist; auch ⋯ „Zutat bearbeiten“ im Lesemodus
  öffnet weiter den Bearbeitungsmodus.
- Kein Fokusmodus des Kochmodus (Seitenleiste aus, Zutaten je Schritt, Wischen zwischen
  Schritten): das berührt die Seitenleiste der App-Hülle (Spec 0057) und ist nicht risikolos klein.
- Keine Sterne und keine „Reste einplanen“ im Fenster nach „Fertig“; kein blinkender Seitentitel.
- Kein Sichern eines Entwurfs über das Schließen des Tabs hinaus (dafür fragt der Browser schon,
  Spec 0037, Entscheidung 10) und keines KI-Entwurfs, der noch kein Rezept ist (Spec 0040).
- Videos laden und spielen weiter nur im Vollbild und erst nach einem Tipp, nie in der Galerie.

## Anforderungen

Ausgangslage: „Lasagne“ (4 Portionen, Foto, Zutaten u. a. „150 g Rote Linsen“, 6 Schritte, kein
Link), „Mango-Curry“ mit Foto und zwei gespeicherten Videos, „Halloumi-Pfanne“ ohne eigenes Foto,
ohne Beispielfoto und ohne Video. Handy = 390 × 844, Desktop = 1440 × 900.

### Lesemodus speichert direkt

**REQ-001 — „+ Zutat“ und „+ Link“ speichern sofort.** Im Lesemodus öffnet „+ Zutat“ das Fenster
„Neue Zutat“ und „+ Link“ das Fenster „Link“ wie bisher; „Übernehmen“ speichert die Zutat bzw. den
Link sofort ins Rezept, die Seite bleibt im Lesemodus. Ändert Spec 0037, AC-002 und Spec 0047,
AC-011. Offline: nur online (beide Knöpfe deaktiviert mit „Offline – zum Bearbeiten brauchst du
Netz“, wie bisher, Spec 0047, AC-012).

- AC-001: Angenommen „Lasagne“ im Lesemodus · Wenn ich „+ Zutat“ tippe, „Muskat“ wähle, „1 Prise“
  eingebe und „Übernehmen“ tippe · Dann ist das Fenster zu, die Seite im Lesemodus (kein
  „Speichern“ oben), „1 Prise Muskatnuss“ steht unter „Zutaten“, und der Hinweis „Gespeichert“
  erscheint
- AC-002: Angenommen „Lasagne“ ohne Links · Wenn ich „+ Link“ tippe, „chefkoch.de/r/1“ eingebe und
  „Übernehmen“ tippe · Dann steht der Link unter „Links“, die Seite ist im Lesemodus, und nach
  Neuladen ist er noch da
- AC-003: Angenommen das Fenster „Neue Zutat“ ist offen und das Netz fällt weg · Wenn ich
  „Übernehmen“ tippe · Dann bleibt das Fenster mit allen Eingaben offen, und der Hinweis „Offline –
  zum Bearbeiten brauchst du Netz“ erscheint; nichts ist gespeichert
- AC-004: Angenommen der Server lehnt die neue Zutat ab · Wenn ich „Übernehmen“ getippt habe ·
  Dann öffnet die Seite den Bearbeitungsmodus mit der Zutat und der Meldung, dass nicht gespeichert
  wurde; nichts Getipptes geht verloren
- AC-005: Angenommen Nadja hat auf ihrem Gerät den Titel geändert, mein Gerät hat es schon geholt ·
  Wenn ich im Lesemodus „+ Zutat“ übernehme · Dann bleibt ihr Titel, und nur die Zutat kommt dazu

**REQ-002 — „Mehrere einfügen“ im Lesemodus.** Neben „+ Zutat“ steht im Lesemodus „Mehrere
einfügen“ und öffnet das Fenster „Zutaten einfügen“ (mit Vorschlägen und Vorschau, Spec 0050).
„Einfügen“ speichert die Zeilen mit Artikel sofort; Zeilen ohne Artikel oder doppelte öffnen danach
den Bearbeitungsmodus mit genau diesen orange Zeilen (wie bei „Neues Rezept“, Spec 0018, E-01).
Offline: nur online (deaktiviert mit dem Offline-Hinweis).

- AC-006: Angenommen „Lasagne“ im Lesemodus · Dann stehen unter den Zutaten „+ Zutat“ und „Mehrere
  einfügen“ nebeneinander
- AC-007: Angenommen ich füge „1 Zwiebel\n2 Möhren“ ein (beide Artikel gibt es) · Wenn ich
  „Einfügen“ tippe · Dann stehen beide unter „Zutaten“, die Seite ist im Lesemodus, „Gespeichert“
  erscheint
- AC-008: Angenommen ich füge „1 Zwiebel\n1 Paniermehl“ ein („Paniermehl“ gibt es nicht und ist
  nicht gewählt) · Wenn ich „Einfügen“ tippe · Dann ist „Zwiebel“ gespeichert, und der
  Bearbeitungsmodus ist offen mit „Paniermehl“ als oranger Zeile und dem Hinweis „1 Zutat
  gespeichert · 1 braucht noch einen Artikel“
- AC-009: Angenommen offline · Dann ist „Mehrere einfügen“ deaktiviert mit dem Offline-Hinweis

### Galerie im Vollbild

**REQ-003 — Im Vollbild zwischen Foto und Videos wischen.** Das Vollbild zeigt alle Seiten der
Galerie der Rezeptseite in ihrer Reihenfolge (Foto, Video 1, Video 2 …). Wischen nach links und
rechts, am Desktop die Pfeile an den Seiten und die Tasten ← und →, wechseln die Seite; Punkte
zeigen, wo ich stehe. Eine Video-Seite zeigt das Vorschaubild mit dem Abspielknopf und lädt das
Video erst nach dem Tipp darauf; wer eine Video-Kachel in der Galerie antippt, landet auf dieser
Seite und das Video spielt sofort (wie bisher). Wischen weg von einem laufenden Video hält es an.
Wischen nach unten und ✕ schließen wie bisher. Offline: offline lesend (Fotos aus dem Cache; eine
Video-Seite zeigt „Video braucht Netz“ statt des Abspielknopfs, Spec 0046, AC-015).

- AC-010: Angenommen „Mango-Curry“ · Wenn ich auf das Foto tippe und nach links wische · Dann zeigt
  das Vollbild „Video 1“ mit Abspielknopf, der zweite von drei Punkten ist hervorgehoben, und es
  wurde kein Video geladen
- AC-011: Angenommen das Vollbild steht auf „Video 1“ · Wenn ich nach links, dann zweimal nach
  rechts wische · Dann steht es auf „Video 2“, dann „Video 1“, dann wieder auf dem Foto
- AC-012: Angenommen Desktop, das Vollbild auf dem Foto · Wenn ich → drücke bzw. den Pfeil rechts
  klicke · Dann steht es auf „Video 1“; auf der letzten Seite gibt es keinen Pfeil rechts
- AC-013: Angenommen ich tippe in der Galerie auf die Kachel „Video 2“ · Dann öffnet das Vollbild
  auf „Video 2“, und das Video lädt und spielt
- AC-014: Angenommen „Video 1“ spielt im Vollbild · Wenn ich zum Foto wische · Dann läuft kein Ton
  mehr
- AC-015: Angenommen ein Rezept nur mit Foto · Dann zeigt das Vollbild das Foto ohne Punkte und
  Pfeile, wie bisher

### Rezeptseite am Handy

**REQ-004 — Aktionen ohne Scrollen.** Am Handy (und Tablet im Hochformat) stehen „Kochen“,
„Einplanen“ und „Auf die Liste“ direkt unter Titel, Beschreibung und der Zeile mit Portionen und
Zeit, vor Einordnung und Sternen. Am Desktop bleiben sie in der Kopfzeile. Offline: wie bisher (nur
„Kochen“ geht, Spec 0008, AC-022).

- AC-016: Angenommen Handy, „Lasagne“ mit Foto und Beschreibung · Wenn die Seite öffnet · Dann ist
  „Kochen“ vollständig sichtbar, ohne zu scrollen, und steht über den Sternen

**REQ-005 — Ohne Foto kompakt.** Hat ein Rezept weder eigenes noch Beispielfoto und kein Video,
zeigt die Seite am Handy und Tablet keinen Platzhalter-Rahmen, sondern nur die Zeile „Foto
hinzufügen“ (mit „Teilen“). Am Desktop bleibt der Platzhalter. Offline: offline lesend („Foto
hinzufügen“ deaktiviert mit dem Offline-Hinweis).

- AC-017: Angenommen Handy, „Halloumi-Pfanne“ ohne Foto und Video · Dann gibt es keinen
  Platzhalter-Rahmen, „Foto hinzufügen“ steht über dem Titel, und der Titel beginnt weniger als
  120 pt unter der Kopfzeile
- AC-018: Angenommen ich lege für „Halloumi-Pfanne“ ein Foto fest · Dann erscheint das Foto im
  4:3-Rahmen wie bei jedem Rezept

### Entwurf sichern

**REQ-006 — Ungespeicherte Änderungen überleben Zurück, Tab-Wechsel und Neuladen.** Solange der
Bearbeitungsmodus eines gespeicherten Rezepts Änderungen hat, sichert die App den Entwurf im
Browser-Tab (sessionStorage). Öffne ich das Rezept wieder (nach Browser-Zurück, Tab-Wechsel unten,
Neuladen), steht oben „Ungespeicherte Änderungen von 17:42“ mit „Weitermachen“ und „Verwerfen“.
„Weitermachen“ öffnet den Bearbeitungsmodus mit dem Entwurf, „Verwerfen“ löscht ihn. Speichern,
„Abbrechen → Verwerfen“ und Abmelden löschen den gesicherten Entwurf. Löst Spec 0037, OFFEN 12.
Offline: offline vollständig für Sichern und Anzeigen („Weitermachen“ öffnet den Entwurf, Speichern
braucht wie immer Netz).

- AC-019: Angenommen ich ändere im Bearbeitungsmodus den Titel von „Lasagne“ in „Omas Lasagne“ ·
  Wenn ich Browser-Zurück drücke und „Lasagne“ wieder öffne · Dann steht oben „Ungespeicherte
  Änderungen von <Uhrzeit>“, und „Weitermachen“ zeigt das Titelfeld mit „Omas Lasagne“
- AC-020: Angenommen derselbe Entwurf · Wenn ich unten zu „Kalender“ und zurück zu „Essen“ wechsle
  und „Lasagne“ öffne · Dann wird der Entwurf angeboten wie in AC-019
- AC-021: Angenommen der Hinweis steht · Wenn ich „Verwerfen“ tippe · Dann ist der Hinweis weg,
  die Seite zeigt „Lasagne“, und nach Neuladen kommt kein Hinweis mehr
- AC-022: Angenommen ich habe den Entwurf mit „Speichern“ gespeichert · Wenn ich die Seite neu lade
  · Dann gibt es keinen Hinweis
- AC-023: Angenommen der Bearbeitungsmodus ohne Änderung · Wenn ich die Seite verlasse und wieder
  öffne · Dann gibt es keinen Hinweis
- AC-024: Angenommen ein gesicherter Entwurf ist kaputt oder gehört zu einem anderen Rezept · Dann
  gibt es keinen Hinweis, und der Eintrag wird gelöscht
- AC-025: Angenommen Nadja hat das Rezept nach meinem Entwurf gespeichert · Wenn ich „Weitermachen“
  und dann „Speichern“ tippe · Dann gelten meine geänderten Felder, ihre übrigen bleiben, und der
  Hinweis „Das Rezept wurde zwischendurch geändert …“ erscheint (Spec 0037, AC-006)

### Kochmodus

**REQ-007 — Abgelaufener Timer klingelt.** Läuft ein Timer ab, spielt die App einmal einen kurzen
Ton (drei kurze Töne, Web Audio) und vibriert, wo das Gerät es kann (Android `navigator.vibrate`).
Der Ton ist durch den Tipp auf „Timer … Min“ freigeschaltet. Das gilt auch für Timer anderer
Schritte. Offline: offline vollständig.

- AC-026: Angenommen der Timer von Schritt 2 läuft · Wenn seine Zeit abläuft, während Schritt 4
  offen ist · Dann ertönt genau einmal der Ton, das Gerät vibriert (wo möglich), und oben steht
  „⏱ Schritt 2 · abgelaufen“
- AC-027: Angenommen ein abgelaufener Timer · Wenn weitere Sekunden vergehen oder ich den Schritt
  wechsle · Dann ertönt der Ton nicht noch einmal; nach „Zurücksetzen“ und erneutem Ablauf schon
- AC-028: Angenommen ein pausierter Timer · Dann ertönt kein Ton
- AC-029: Angenommen der Browser kennt kein Web Audio oder keine Vibration · Dann läuft der
  Kochmodus ohne Fehler weiter, und der Timer zeigt „Timer abgelaufen“

**REQ-008 — „Fertig“ trägt „heute gekocht“ ein.** Tippe ich im Kochmodus auf dem letzten Schritt
„Fertig“ und zählt heute
kein Planeintrag als gekocht für dieses Rezept (Regel von „Zuletzt gekocht“, `cookingHistory`), fragt
ein kleines Fenster „Heute gekocht eintragen?“ mit „Eintragen“ und „Nicht eintragen“. „Eintragen“
legt für heute einen Eintrag an (Tageszeit wie „Einplanen“: die letzte, bei Frühstück die erste;
alle, die zu Hause sind; die gekochten Portionen und die Variante) und verlässt den Kochmodus mit
dem Hinweis „Heute gekocht eingetragen“; „Nicht eintragen“ verlässt ihn ohne Eintrag; Escape oder
ein Tipp daneben lassen mich im Kochmodus. Mit Eintrag heute verlässt „Fertig“ den Kochmodus wie
bisher. Offline: nur online (offline fragt „Fertig“ nicht und verlässt den Kochmodus wie bisher).

- AC-030: Angenommen heute steht nichts im Plan, ich koche „Lasagne“ für 6 Portionen · Wenn ich
  „Fertig“ und „Eintragen“ tippe · Dann steht „Lasagne“ heute „Abend“ für 6 im Kalender, und
  „Zuletzt gekocht“ der Lasagne ist heute
- AC-031: Angenommen „Lasagne“ steht heute „Mittag“ im Plan · Wenn ich „Fertig“ tippe · Dann gibt
  es keine Frage, und der Kochmodus schließt
- AC-032: Angenommen „Lasagne“ steht heute im Plan, aber „Nicht gemacht“ · Wenn ich „Fertig“ tippe
  · Dann fragt die App „Heute gekocht eintragen?“
- AC-033: Angenommen die Frage steht · Wenn ich „Nicht eintragen“ tippe · Dann ist kein Eintrag
  angelegt und der Kochmodus zu; tippe ich Escape, bin ich weiter im Kochmodus
- AC-034: Angenommen offline · Wenn ich „Fertig“ tippe · Dann gibt es keine Frage, und der
  Kochmodus schließt
- AC-035: Angenommen das Rezept wurde auf einem anderen Gerät gelöscht · Wenn ich „Eintragen“ tippe
  · Dann ist nichts eingetragen, und die App sagt „Das Rezept gibt es nicht mehr“ (Spec 0008, E6)

### Nachklick iPhone 27.11.: Kopfzeile und Foto

**REQ-009 — Der Titel blendet in die Kopfzeile ein.** Am Handy blendet der Titel in der Kopfzeile
erst ein, wenn der große Titel der Seite unter der Kopfzeile verschwunden ist: nur über die
Deckkraft (150 ms), einzeilig und mit „…“ gekürzt (ein mehrzeiliger Titel zeigt nur den Anfang der
ersten Zeile), in der Zeile zwischen „‹ Essen“ und den Knöpfen. Er bleibt, solange gescrollt ist,
und blendet aus, sobald der große Titel wieder zu sehen ist. Die Kopfzeile ändert dabei ihre Höhe
nicht. Gilt für Rezept- und Sammlungsseite. Präzisiert Spec 0008, AC-020 („nach dem Scrollen
erscheint dort ‚Lasagne‘“); der Nicht-Ziel-Punkt „Kopfzeile bleibt unberührt“ gilt dafür nicht.
Offline: offline vollständig.

- AC-036: Angenommen Handy, „Mango-Curry“ · Wenn ich schnell nach unten scrolle · Dann blendet
  „Mango-Curry“ in der Kopfzeile erst ein, wenn der große Titel unter ihr verschwunden ist, nur über
  die Deckkraft und nie in großer Schrift · Und scrolle ich zurück, bis der große Titel wieder zu
  sehen ist, blendet er aus
- AC-037: Angenommen Handy, „Mango-Curry“ einmal nach unten und wieder ganz nach oben gescrollt ·
  Dann steht das Foto so dicht unter der Kopfzeile wie beim Öffnen (keine Lücke), und die Kopfzeile
  war beim Scrollen immer gleich hoch

**REQ-010 — Das Foto bleibt beim Wechsel in den Bearbeitungsmodus.** Tippe ich ✎ oder im
Bearbeitungsmodus „Abbrechen“ bzw. „Speichern“, bleibt das Titelfoto in jedem Bild sichtbar. Gilt
für Rezept- und Sammlungsseite. Offline: offline lesend (✎ deaktiviert wie bisher).

- AC-038: Angenommen „Mango-Curry“ aus der Liste geöffnet · Wenn ich ✎ und danach „Abbrechen“ tippe
  · Dann ist das Foto in keinem Bild ein leerer Rahmen, und die Seite steht an derselben Stelle

## Entscheidungen

1. Der Lesemodus speichert über den vorhandenen Befehl `saveRecipePage`: ein frischer Entwurf der
   Seite (`pageDraft`) mit nur dem geänderten Abschnitt, also eine Transaktion, und nur die neuen
   Zeilen gehen hinaus — Änderungen anderer Geräte in anderen Feldern bleiben (AC-005). Kein neuer
   Befehl, keine Migration.
2. Lehnt der Server ab, öffnet der Bearbeitungsmodus mit dem versuchten Abschnitt und der Meldung
   (wie Spec 0037, AC-004), statt die Eingabe zu verwerfen (AC-004).
3. Orange Zeilen aus „Mehrere einfügen“ öffnen erst nach dem bestätigten Speichern der übrigen den
   Bearbeitungsmodus, damit dessen Entwurf die gerade gespeicherten Zeilen schon enthält und sie
   beim nächsten „Speichern“ nicht wieder entfernt.
4. Der Knopf heißt im Lesemodus „Mehrere einfügen“ wie im Bearbeitungsmodus (Enricos „mehrere
   hinzufügen“ meint diesen Knopf); ein Name für eine Sache.
5. Das Vollbild wird ein Blätterer im Vollbild (`PhotoViewer` mit Seiten, gleiche Mechanik wie die
   Galerie: Paging-Scroll, auf dem Web CSS Scroll Snap). Eine Video-Seite lädt erst nach dem Tipp —
   sonst würde schon Vorbeiwischen ganze Videos laden. Das „Fertig“ des iPhone-eigenen
   Video-Players führt zurück auf die Video-Seite des Vollbilds statt alles zu schließen, damit man
   weiterwischen kann (ändert Spec 0046, AC-014). Der Kochmodus behält seinen Video-Player.
6. Aktionen am Handy: direkt unter Kopf (Titel, Beschreibung, Portionen/Zeit), nicht als feste
   Leiste unten. Grund: keine neue Schicht über Tab-Leiste, Hinweisen und Tastatur; mit Foto 4:3
   bleibt „Kochen“ bei 390 × 844 im ersten Bildschirm (AC-016).
7. Entwurf sichern mit `sessionStorage` statt einer Abfrage beim Verlassen: Browser-Zurück lässt sich
   im Web nicht zuverlässig aufhalten (der Verlauf ist schon zurück), der Router hat dafür keinen
   Haken ohne neue Abhängigkeit (Spec 0037, OFFEN 12). Das Sichern deckt jeden Weg ab (Zurück,
   Tab-Wechsel, Neuladen, Absturz), kostet keine Abhängigkeit und keine Datenbank. sessionStorage
   statt localStorage: der Entwurf bleibt im Tab und verschwindet mit ihm. Gesichert wird der
   Seitenentwurf ohne das gewählte, noch nicht gespeicherte Foto (Blob); gelesen wird er mit einer
   Prüfung der Form (Zod) in `core`.
8. Ton per Web Audio (Oszillator, keine Audiodatei), der `AudioContext` entsteht bzw. wird
   fortgesetzt beim Tipp auf den Timer — iOS spielt Web Audio nur nach einer Geste. Bei iPhone im
   Stumm-Modus bleibt er stumm; iOS Safari kann nicht vibrieren. Welche Timer klingeln, rechnet
   `core` rein (einmal je Ablauf).
9. Der Eintrag nach „Fertig“ nutzt `defaultPlanChoice` (heute, letzte Tageszeit bzw. erste bei
   Frühstück, alle zu Hause) und `addPlanEntry`; ob heute schon etwas zählt, entscheidet dieselbe
   Regel wie „Zuletzt gekocht“ (`cookingHistory`), damit beide nie auseinanderlaufen.
10. Bau 27.11.: Gefragt wird nur beim „Fertig“ unten auf dem letzten Schritt. Das „Fertig“ oben
    (Hinweis „Kochmodus beenden“) bleibt der Ausgang ohne Frage: wer mittendrin geht, hat meist
    nicht fertig gekocht.
11. Bau 27.11.: Die Vollbild-Seiten nehmen nur mit Maus den Tastaturfokus (← →); am Touch-Gerät
    zeigte der Fokus einen Rahmen um das Bild. Eine Video-Seite, die aus ihrer Kachel geöffnet
    wurde, spielt sofort; wischt man weg und zurück, steht wieder der Abspielknopf da.
12. Bau 27.11.: Im Fenster „Neue Zutat“ des Lesemodus heißt es „Wird mit „Übernehmen“ neu
    angelegt“ statt „… mit „Fertig“ …“, weil dort gleich gespeichert wird. Die Entwurfssicherung
    gilt auch für Sammlungen (gleicher Bearbeitungsmodus).
13. Nachklick 27.11., N-03/iN-04 (ändert Spec 0008, AC-060): Was nichts bewirkt, steht nicht da.
    „Kochen“ fehlt bei einem Rezept ohne Schritte, „Auf die Liste“ (und „Noch keine Zutaten“), wenn
    es bei Portionen und Variante nichts zu kaufen gibt; statt ausgegraut sind sie ausgeblendet.
    N-15: ✨ „Mit KI ändern“ steht in der Kopfzeile auf einer Linie mit den anderen Knöpfen.
    N-01: Im Bearbeitungsmodus stehen die Zutaten wie auf der Rezeptseite unter „Alle Varianten“, je
    Variante und je Gruppe (core `ingredientSections`); verschoben wird innerhalb eines Teils, Variante
    und Gruppe ändert ⋯ „Zutat bearbeiten“. Die Schritte bleiben in der Reihenfolge des Kochens mit
    der Variante darunter: nach Varianten getrennt ginge die Reihenfolge verloren.
14. Nachklick iPhone 27.11., Lücke über dem Foto (AC-037): Am Handy passen neben „‹ Essen“ und vier
    Knöpfen nur wenige Buchstaben in die Zeile, daher stellte die Kopfzeile den Titel nach dem
    Scrollen in eine eigene Zeile darunter (Review 0003) und wurde 27 pt höher. `Screen` legt den
    Inhalt unter die gemessene schmale Leiste; war sie höher als die volle Kopfzeile, rechnete er
    einen negativen Abstand, den der Browser verwirft (der alte Wert von 60 px blieb) — nach einmal
    Hinunter- und Hinaufscrollen stand das Foto 87 pt tiefer (≈ 1/6 des Bildschirms; im Simulator
    nachgestellt, `tmp/iphone-header/`). Behoben an beiden Stellen: `Screen` legt den Inhalt nie
    tiefer als unter die volle Kopfzeile, und die Kopfzeile mit großem Titel auf der Seite ändert
    ihre Höhe nicht mehr (REQ-009).
15. Nachklick iPhone 27.11., Titel blitzt groß auf (AC-036): Der Titel erschien schon nach 56 pt
    Scrollen, während der große Titel noch zu sehen war, zuerst in der Zeile und ein Bild später in
    einer eigenen Zeile — die Kopfzeile wuchs, der Inhalt sprang. Enricos Entscheidung (Empfehlung
    vorab angenommen): einblenden statt wachsen. Die Seite meldet ihren großen Titel
    (`useLargeTitle`), `Screen` misst bei jedem Scrollen, ob seine Unterkante unter der Kopfzeile
    liegt; der Titel steht immer in der Zeile und ändert nur die Deckkraft (bei „Bewegung
    reduzieren“ ohne Übergang). Ohne großen Titel (Bearbeitungsmodus) bleibt das Verhalten aus
    Review 0003: Titel nach dem Scrollen, bei zu wenig Platz in eigener Zeile statt „Ge…“; dank
    Entscheidung 14 rückt der Inhalt dabei nicht. Andere Seiten mit `ScreenHeader` ohne
    `titleOnScroll` sind nicht betroffen (nur die Begrenzung aus Entscheidung 14 gilt für alle).
16. Nachklick iPhone 27.11., B-04 (AC-038): Der Bearbeitungsmodus schaltet das Wischen zum
    nächsten Rezept aus (Spec 0034, REQ-008). `Screen` ließ dafür den Wisch-Bereich um den Inhalt
    weg — React baute die ganze Seite neu auf, das Foto stand rund 4 Bilder leer, bis es neu
    dekodiert war. Jetzt behält `Screen` den Wisch-Bereich, sobald einmal gewischt werden konnte,
    und schaltet ihn nur aus; die Seite bleibt montiert.

## Daten

Geschrieben wird nur über vorhandene Befehle: Rezeptzutaten und Links (`saveRecipePage`), ein
Planeintrag (`addPlanEntry`). Neu im Browser: je Rezept ein gesicherter Seitenentwurf unter
`housekeeping.recipe-draft.<recipeId>` in sessionStorage (Rezepttexte, keine Zugangsdaten), gelöscht
bei Speichern, Verwerfen und Abmelden. Keine Schema-Änderung.

## Umsetzung

- [x] 1. `core`: Aufteilen neuer Zutatenzeilen in speicherbar/orange für den Lesemodus (AC-007,
      AC-008), rot → grün
- [x] 2. `core`: Entwurfssicherung lesen/schreiben/benennen mit Zod-Prüfung (AC-019, AC-024), rot →
      grün
- [x] 3. `core`: Timer, die klingeln sollen (AC-026–AC-028); „zählt heute als gekocht“
      (AC-030–AC-032), rot → grün
- [x] 4. `ui`: `MediaGallery`/`PhotoViewer` mit Seiten, Startseite, Pfeilen und Tasten (AC-010–AC-015),
      rot → grün
- [x] 5. App: Lesemodus speichert direkt, „Mehrere einfügen“ (AC-001–AC-009)
- [x] 6. App: Vollbild-Blätterer der Rezeptgalerie mit Video-Seiten (AC-010–AC-015)
- [x] 7. App: Aktionen nach oben, kompakt ohne Foto (AC-016–AC-018)
- [x] 8. App: Entwurf sichern und anbieten, Abmelden löscht ihn (AC-019–AC-025)
- [x] 9. App: Timer-Ton und Vibration, „Fertig“-Fenster (AC-026–AC-035)
- [x] 10. e2e `e2e/rundgang-rezeptseite-0056.spec.ts` (läuft beim Koordinator); bestehende e2e
      nutzen den Lesemodus-Weg von Spec 0037 AC-002 / 0047 AC-011 nicht
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün; Screenshots Desktop
      1440 × 900 und Handy 390 × 844 in `tmp/review-0004/0056/`
- [x] 11. Nachklick iPhone 27.11.: `ui` Kopfzeile blendet ein, `Screen` ohne Lücke und ohne Neuaufbau
      beim Bearbeiten (AC-036–AC-038), rot → grün; App: großer Titel meldet sich (`useLargeTitle`)

**Nachweis (27.11.2026):** Die neuen Tests in `core` (`page-editor`, `page-draft-backup`,
`cooking-timers`, `cooking-history`) und `ui` (`photo-viewer`) liefen zuerst rot (Funktionen bzw.
Seiten fehlten), dann grün. `pnpm format:check && pnpm check && pnpm build:web` grün. Am eigenen
Dev-Server durchgeklickt (Handy 390 × 844, Desktop 1440 × 900): „+ Link“ speichert und bleibt im
Lesemodus; als der lokale Server gerade nicht erreichbar war, öffnete sich der Bearbeitungsmodus mit
dem Link und „Hat nicht geklappt“ (AC-004); Entwurf nach Browser-Zurück angeboten und
„Weitermachen“ füllt das Titelfeld; „Fertig“-Frage, Escape bleibt im Kochmodus, mit Eintrag heute
keine Frage; Vollbild mit zwei untergeschobenen Videos (nur im Browser-Kontext): Foto → Video 1 →
Video 2 → zurück, aus der Kachel „Video 2“ öffnet Seite 3 und lädt. Die e2e-Datei läuft beim
Koordinator. Nicht geprüft: echter Ton und echte Vibration auf einem Gerät, iPhone-Simulator.

**Nachweis Nachklick iPhone (27.11.2026):** Rot, dann grün: `shell.test.tsx` (AC-036, AC-037 je für
Kopfzeile und `Screen`, AC-038), `large-title.test.ts`. iPhone-Simulator (Safari und installiert),
Videos Bild für Bild in `tmp/iphone-header/`: vorher nach Hinunter- und Hinaufscrollen 87 pt Lücke
über dem Foto, der Titel erst in der Zeile, ein Bild später in eigener Zeile (Kopfzeile wuchs,
Inhalt sprang), beim Wechsel in den Bearbeitungsmodus 4 Bilder leerer Fotorahmen; nachher Foto an
derselben Stelle, Kopfzeile gleich hoch, „Mango-…“ blendet ein, sobald der große Titel verschwunden
ist, Foto in jedem Bild sichtbar, Wischen zum nächsten Rezept geht danach weiter und ist im
Bearbeitungsmodus aus. Desktop 1440 × 900 unverändert. e2e in `rundgang-rezeptseite-0056.spec.ts`
(AC-036–AC-038) läuft in GitHub.
