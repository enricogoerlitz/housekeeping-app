---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-22
---

# 0019 — Bedienung überall und Zustand in der Adresse

**Quelle:** ER-01–ER-07, ER-35, ER-36, X-01, X-03, X-04, X-05, V-12
**Kritischer Pfad:** ja: Anmeldung (Rückkehr zur Adresse, REQ-016), Mandantentrennung (Ids aus der
Adresse, REQ-017), Laden-Warteschlange („+“ auf der Liste offline, REQ-010). Keine Datenbank.

## Ziel

Die Web-App bedient sich auf Handy und Desktop wie eine App: Markieren nur, wo man kopiert;
Fokusrahmen nur per Tastatur, nie abgeschnitten; Hover nur mit Maus; Menüs ohne Sprung und ohne
Vorauswahl; ein Bereich zeigt immer seine Startseite, „Zurück“ führt zur Herkunft. Auf dem iPhone
liegt nichts unter Ecken, Home-Leiste oder Statusleiste. Ansicht, Filter, Suche, Sortierung, Tag im
Kalender, Auswahl und offenes Fenster stehen in der Adresse; Neuladen und eine kopierte Adresse
zeigen dasselbe wieder.

## Nicht-Ziele

- Keine neuen Fenster oder Funktionen: die neuen Fenster der Welle bauen 0020, 0022, 0024, 0025;
  hier steht nur, wie sie in der Adresse stehen (Anhang).
- Keine Eingaben in der Adresse: ungespeicherte Formulare, Toasts, Rückfragen, Ziehen und
  Scroll-Position nicht. Keine Weiterleitung für umbenannte Parameter (`view`, `rid`, …).
- Keine Aufgaben-Haken ohne Netz (Alternative zu X-03, bräuchte einen ADR-Nachtrag).
- Keine weiteren iPhone-Wünsche; was Enrico nachreicht, kommt in eine eigene Spec.

## Schon erledigt

- Fokusrahmen nur per Tastatur bei `Button`, `IconButton`, `ViewTabs`, Tages-Fenster, Monat,
  „Vorgemerkt“: Spec 0016, `keyboardFocusRing` in `packages/ui/src/controls.tsx`.
- Kein Zoom in Eingabefelder: 16 px in `TextField` (`controls.tsx`, `theme.type.body` aller Themes).
- Kein grauer Tipp-Blitz, keine Tipp-Verzögerung: react-native-web setzt
  `-webkit-tap-highlight-color: transparent` und `touch-action: manipulation`.
- Kein `100vh`: `html`, `body`, `#root` haben `height: 100%` (`apps/app/public/index.html`).
- Hintergrund im dunklen Design: `SystemUI.setBackgroundColorAsync` (`apps/app/src/app/_layout.tsx`).
- „Zurück“ zur Packkarte und zu „Reisen“: `von=uebersicht|reisen` (`features/packing/trip-screen.tsx`).

## Anforderungen

Beispiele: Haushalt „Enrico & Nadja“, angemeldet Enrico, heute Sonntag, 22.11.2026. „Handy“ = die
installierte Web-App auf einem iPhone mit Home-Leiste; „Desktop“ = Browser mit Maus ab 1024 px.

### Markieren, Fokus, Hover

**REQ-001 — Markieren nur, wo man kopiert.** Bedienelemente und Beschriftungen sind nicht
markierbar; Inhalt zum Kopieren bleibt markierbar. Quelle: ER-02. Offline: vollständig.

Nicht markierbar: Seitenleiste, Tab-Leiste, Kopfzeilen und Seitentitel, „Zurück“, Knöpfe, Chips,
Ansichts-Tabs, Menüs, Abschnittstitel, Zeilen und Kacheln als Tippfläche (`ListRow`, `MediaCard`),
Badges, Hinweise, Toasts, Fenstertitel, Kalender (Kopf mit „von – bis“, Zellen, Einträge,
Tages-Fenster), Tagesleiste und Wochen-Beschriftung der Übersicht. Markierbar: Rezeptschritte (auch
im Kochmodus), Zutaten und Beschreibung in der Leseansicht, Notizen, Adresse des Restaurants, Links,
Feedback-Texte, alles in Eingabefeldern.

- AC-001: Angenommen Desktop · Wenn ich über „Essen“ in der Seitenleiste, den Titel „Kalender“ und
  die Wochen-Beschriftung der Übersicht ziehe oder doppelklicke · Dann wird nichts markiert.
- AC-002: Angenommen Rezept „Lasagne“ in der Leseansicht · Wenn ich Schritt 2 und die Zutat
  „500 g Hackfleisch“ markiere und kopiere · Dann steht der Text in der Zwischenablage.
- AC-003 (Rand): Angenommen Handy · Wenn ich lange auf „Speichern“ oder einen Tab drücke · Dann
  erscheint weder Markierung noch das iOS-Menü „Kopieren“; in einem Eingabefeld geht beides weiter.

**REQ-002 — Fokusrahmen nur per Tastatur.** Jedes Bedienelement zeigt den Fokusrahmen nur bei
`:focus-visible`, nie nach Klick oder Tipp, und der Rahmen wird nicht vom Container abgeschnitten.
Quelle: ER-03. Offline: vollständig.

Heute noch mit Rahmen nach Klick (`focusRing` statt `keyboardFocusRing`): in `shell.tsx` BackLink,
TabBar, Sidebar und SidebarRow, Fab; `ChipView`, `Checkbox`, `SwitchRow`, `Stars` (`controls.tsx`);
Auslöser von `Menu` und `Popover` (`choice.tsx`); `ListRow` (`lists.tsx`); `MediaCard`, `KindLine`
(`display.tsx`); `Disclosure`; `MonthCalendar`; `ReorderList`; Griff des `DockedPanel`;
`SearchOrCreate`; Jahresansicht (`year-view.tsx`); eigene Rahmen in `app-sidebar.tsx` (Profil) und
`theme-picker.tsx`. Danach gibt es nur noch eine Funktion für den Rahmen.

- AC-004: Angenommen Desktop · Wenn ich in der Seitenleiste „Haushalt“, im Fenster „Neue Aufgabe“
  den Chip „Wöchentlich“, die Kachel „Lasagne“ und den Tab „Monat“ anklicke · Dann hat keines davon
  einen Rahmen.
- AC-005: Angenommen Desktop · Wenn ich mit Tab durch Seitenleiste, Chips und Kacheln gehe · Dann
  hat das fokussierte Element einen Rahmen, der auf allen vier Seiten ganz sichtbar ist, auch beim
  ersten Chip am Rand einer waagrecht scrollenden Chip-Reihe.
- AC-006 (Rand): Angenommen Handy · Wenn ich Tabs, Chips und Zeilen antippe · Dann erscheint nie ein
  Rahmen.

**REQ-003 — Hover nur mit Maus.** Mit Maus oder Trackpad (`hover: hover` und `pointer: fine`)
zeigen Kacheln, Listenzeilen, Chips, Ansichts-Tabs, Einträge der Seitenleiste, Kalendereinträge und
-felder, Tage der Tagesleiste und Symbolknöpfe einen Hover-Zustand; auf Touch nie. Quelle: ER-04.
Offline: vollständig.

- AC-007: Angenommen Desktop · Wenn die Maus über der Kachel „Lasagne“, der Zeile „Bad putzen“ und
  dem Chip „Favoriten“ steht · Dann hebt sich jedes sichtbar ab (Fläche `surfaceSunken` oder
  Schatten nach DESIGN.md) und verliert das beim Verlassen.
- AC-008 (Rand): Angenommen Handy oder iPad ohne Trackpad · Wenn ich die Kachel „Lasagne“ antippe und
  zurückkehre · Dann zeigt keine Kachel einen Hover-Zustand.

### Menüs

**REQ-004 — Menüs ohne Sprung, ohne Vorauswahl.** Ein Menü (`Menu`) und ein Aufklapp-Fenster
(`Popover`, z. B. „+2 weitere“) schließen an ihrem Platz; mit Maus oder Finger geöffnet ist kein
Eintrag markiert, mit der Tastatur geöffnet hat der erste Eintrag (bei einer Auswahl die aktuelle)
den Fokus. Quelle: ER-06. Offline: vollständig.

Ursache (`packages/ui/src/choice.tsx`): Beim Schließen wird die Position auf `undefined` gesetzt,
während das Modal noch ausblendet; die Lage fällt auf links oben (8, 6). Beim Öffnen fokussiert ein
Effekt immer einen Eintrag, und der Eintrag färbt sich bei Fokus ohne `:focus-visible`. Betroffen
sind alle Menüs, u. a. Sortierung in Essen, Aktivitäten, Artikel; ⋯ an Rezept, Zutat, Schritt,
Inhalt, Eintrag, Reise, Tasche, Liste, Markt, Bereich; „Wer?“ in „Was hast du erledigt?“; „+n
weitere“ im Monat.

- AC-009: Angenommen Desktop, Sortierung „Zuletzt“ in Essen · Wenn ich das Menü öffne und „A–Z“
  wähle, oder es mit Escape oder Klick daneben schließe · Dann blendet es an seinem Platz aus und ist
  zu keinem Zeitpunkt links oben zu sehen.
- AC-010: Angenommen Desktop · Wenn ich ⋯ an „Lasagne“ mit der Maus öffne · Dann ist kein Eintrag
  grau, bis die Maus darauf steht; bei der Sortierung trägt „Zuletzt gekocht“ nur den Haken.
- AC-011 (Rand): Angenommen Desktop · Wenn ich ⋯ mit Tab und Enter öffne · Dann hat der erste Eintrag
  den Fokusrahmen, Pfeiltasten bewegen ihn, Escape schließt und der Fokus steht wieder auf ⋯.

### Navigation

**REQ-005 — Ein Bereich zeigt seine Startseite.** Wer in Tab-Leiste oder Seitenleiste einen Bereich
wählt, sieht dessen Startseite so, wie er sie zuletzt verlassen hat (Ansicht, Filter, Suche,
Sortierung), aber ohne Detailseite und ohne offenes Fenster; das gilt auch, wenn man schon im
Bereich ist. Quelle: ER-07. Offline: vollständig.

- AC-012: Angenommen ich habe in Essen „Lasagne“ geöffnet und bin zu „Liste“ gewechselt · Wenn ich
  „Essen“ wähle · Dann sehe ich die Rezeptliste, nicht „Lasagne“, mit der vorher eingestellten Suche.
- AC-013: Angenommen ich bin in der Aktivität „Eislaufen“ (Bereich Kalender) · Wenn ich „Kalender“
  wähle · Dann sehe ich den Kalender in der zuletzt gewählten Ansicht ohne offenes Fenster.
- AC-014 (Rand): Angenommen Essen-Liste → „Lasagne“ → „Liste“ → „Essen“ · Wenn ich danach zweimal die
  Zurück-Taste des Browsers drücke · Dann sehe ich zuerst „Liste“, dann „Lasagne“.

**REQ-006 — „Zurück“ führt zur Herkunft und nennt sie.** Jede Detailseite (Rezept, Sammlung,
Restaurant, Aktivität, Reise, Reisetasche, Markt, Artikel) kennt ihre Herkunft aus `von`, beschriftet
„Zurück“ damit und hebt in Tab-Leiste oder Seitenleiste diesen Bereich hervor; ohne `von` gilt der
eigene Bereich. Quelle: X-01, X-05, ER-07. Offline: vollständig.

Ist der vorige Verlaufseintrag die Herkunft, geht „Zurück“ dorthin (mit ihrem Zustand); sonst zur
Startseite der Herkunft. Werte von `von`: `uebersicht`, `essen`, `kalender`, `liste`, `haushalt`,
`verwalten`, `reisen`.

- AC-015: Angenommen die Übersicht zeigt Dienstag, 24.11. · Wenn ich „Lasagne“ öffne · Dann steht
  oben „‹ Übersicht“ und „Übersicht“ ist hervorgehoben · Wenn ich „‹ Übersicht“ wähle · Dann zeigt
  die Übersicht wieder Dienstag, 24.11.
- AC-016: Angenommen im Kalender ist der Eintrag „Trattoria Da Enzo“ offen · Wenn ich „Restaurant
  öffnen“ und dann „‹ Kalender“ wähle · Dann sehe ich dieselbe Woche mit dem offenen Eintrag.
- AC-017: Angenommen Desktop, ich öffne „Aktivitäten“ aus „Haushalt“ · Dann heißt der Knopf
  „‹ Haushalt“ und führt dorthin (heute „Zurück: Kalender“).
- AC-018 (Rand): Angenommen ich lade `/rezept/<ID der Lasagne>?von=quatsch` direkt · Dann steht
  „‹ Essen“, „Essen“ ist hervorgehoben, und „Zurück“ führt zur Rezeptliste, nicht aus der App.

**REQ-007 — Haushalt und Namen in der Navigation.** Auf dem Handy steht bei mehr als einem Haushalt
der Name des aktiven Haushalts als antippbare Zeile oben auf der Übersicht und öffnet „Haushalt
wechseln“; die Verwalten-Gruppen heißen „Planen“, „Einkauf“ und „Haushalt & Konto“. Quelle: X-04,
V-12. Offline: lesend (Wechseln geht offline, es ist lokal).

- AC-019: Angenommen Enrico ist in „Enrico & Nadja“ und „Test“ · Wenn er auf dem Handy die Übersicht
  öffnet · Dann steht oben „Enrico & Nadja ▾“; ein Tipp öffnet „Haushalt wechseln“.
- AC-020 (Rand): Angenommen Enrico ist nur in „Enrico & Nadja“ · Dann steht auf der Übersicht keine
  Haushaltszeile.
- AC-021: Angenommen ⊞ „Verwalten“ · Dann heißen die Gruppen „Planen“, „Einkauf“ und „Haushalt &
  Konto“; keine Gruppe heißt „Einkaufen“ oder „Haushalt“.

### iPhone und Handy

**REQ-008 — Sichere Ränder und Statusleiste.** Die Seite reicht bis an den Bildschirmrand
(`viewport-fit=cover`); Tab-Leiste, Fenster von unten, Tages-Fenster, Toasts, Assistent-Knopf, die
Fußleisten von Einkaufsmodus und Kochmodus und die Anmeldeseite halten den unteren, Kopfzeilen und
Fenster den oberen sicheren Rand ein, im Querformat auch links und rechts. Die Statusleiste und die
Fläche darunter haben die Farbe der Kopfzeile im gewählten Theme, hell wie dunkel, ab dem ersten Bild.
Quelle: ER-35, ER-36, ER-01. Offline: vollständig.

```
│ 9:41  Statusleiste  ▮▮▮ │ ← Farbe der Kopfzeile
│ Essen                ⊞  │ ← unter der Statusleiste
│ Toast „Lasagne entfernt“│ ← über der Tab-Leiste
│ ☀  🍴  ▦  🧺  ☑        │ ← über der Home-Leiste
└──── Home-Leiste ────────┘ ← Farbe der Tab-Leiste
```

- AC-022: Angenommen Handy · Dann liegen die Symbole der Tab-Leiste ganz über der Home-Leiste und
  werden nicht von den runden Ecken angeschnitten; ebenso „Speichern“ im Fenster „Neue Aufgabe“, die
  Fußleiste in „Einkaufen“ und „Weiter“ im Kochmodus.
- AC-023: Angenommen Handy, Theme „Markthalle“ hell · Dann hat die Statusleiste den Hintergrund
  `#FAF6EE` mit dunkler Schrift · Wenn ich in den Einstellungen „Dunkel“ wähle · Dann wird sie ohne
  Neuladen dunkel mit heller Schrift.
- AC-024: Angenommen Handy · Wenn ich nach „Lasagne entfernt“ schaue · Dann steht der Toast über der
  Tab-Leiste; in „Einkaufen“ (ohne Tab-Leiste) über der Fußleiste.
- AC-025 (Rand): Angenommen das dunkle Design ist eingestellt · Wenn die App kalt startet · Dann
  blitzt vor dem ersten Bild keine helle Fläche auf.

**REQ-009 — Handy-Grundregeln.** Mit Finger (`pointer: coarse`) ist jede Tippfläche mindestens
44 × 44 pt; mit Maus mindestens 24 × 24 px, ebenso die Tage der Jahresansicht. Lange drücken auf ein
Bedienelement öffnet kein iOS-Menü (`-webkit-touch-callout: none`); Fenster, Menüs und das
Tages-Fenster geben ihr Scrollen nicht an die Seite dahinter weiter (`overscroll-behavior:
contain`); die Schrift wird im Querformat nicht vergrößert (`-webkit-text-size-adjust: 100%`).
Quelle: ER-01. Offline: vollständig.

Heute zu klein (Fläche, `hitSlop` wirkt im Web nicht): `IconButton` 40 bzw. 36, `Button` `sm` und
`link` 36, Chips 36, Menü-Knopf 36, „Zurück“ 32, „+n weitere“ ≈ 20, `Checkbox` 26, Griff des
Tages-Fensters 64 × 20, „Rückgängig“ im Toast 36, Kalender-Streifen 26, „+“ der Woche 28, Tageszahl
im Monat ≈ 30, Jahr-Tage ≈ 14. Die sichtbare Größe darf bleiben; die Tippfläche wächst.

- AC-026: Angenommen Handy · Dann misst die Tippfläche von „‹ Essen“, ⋯, dem Chip „morgen“ in „Neue Aufgabe“ und dem
  Haken einer Aufgabe je mindestens 44 × 44 pt (Test über die gemessene Fläche).
- AC-027: Angenommen Handy, das Fenster „Neue Aufgabe“ ist bis unten gescrollt · Wenn ich weiter
  ziehe · Dann bewegt sich die Seite dahinter nicht.
- AC-028 (Rand): Angenommen Desktop, Jahresansicht · Dann ist jeder Tag mindestens 24 × 24 px
  anklickbar.

### Offline-Hinweise

**REQ-010 — Offline-Hinweise passen zum Bildschirm.** Das Banner heißt „Offline – Lesen, Einkaufen und
Packen gehen“; jeder Bildschirm zeigt den Hinweis „Offline – zum Bearbeiten brauchst du Netz“
höchstens einmal (gesperrte Knöpfe behalten ihn als Hinweis beim Darüberfahren bzw. für Screenreader);
auf der Liste geht „+“ an einem Posten offline wie das Eintippen über die Laden-Warteschlange, „−“
bleibt gesperrt. Quelle: X-03. Offline: „+“ offline vollständig, „−“ nur online.

- AC-029: Angenommen offline · Wenn ich die Übersicht öffne · Dann steht oben „Offline – Lesen,
  Einkaufen und Packen gehen“ und darunter genau einmal „Offline – zum Bearbeiten brauchst du Netz“,
  nicht je Abschnitt (heute „Haushalt“ und „Wie war's?“ je einmal).
- AC-030: Angenommen offline, auf der Liste steht „Milch 1×“ · Wenn ich „+“ tippe · Dann steht „Milch
  2×“ mit dem Zeichen für „wartet auf Netz“ · Wenn das Netz zurück ist · Dann steht „Milch 2×“ auf
  allen Geräten.
- AC-031 (Rand): Angenommen offline · Dann ist „−“ an „Milch“ ausgegraut · Und wird „Milch“ auf einem
  anderen Gerät gelöscht, bevor das „+“ gesendet ist · Dann entsteht ein neuer Posten „Milch 1×“
  (Regel „Posten hinzufügen“ aus dem Nachtrag zu ADR-0008).

### Zustand in der Adresse

Regeln für alle Seiten; die Namen stehen im Anhang.

- In der Adresse: offenes Fenster und wofür (nur Ids), Ansicht (Tab), Filter, Suchtext, Sortierung,
  im Kalender Ansicht und Tag (daraus der Zeitraum), Auswahl in Liste und Detail, Herkunft `von`.
- Nicht in der Adresse: ungespeicherte Eingaben, Toasts, Rückfragen, Fragen, die die App von sich
  aus stellt („Wo kaufst du ein?“, „Wo liegt …?“), Auswahl-Fenster wie Menüs, Filter-Fenster und
  „Haushalt wechseln“, der Assistent, Ziehen, Scroll-Position.
- Standardwerte fehlen in der Adresse (`/kalender` = Woche mit heute).

**REQ-011 — Ansicht, Filter, Suche, Sortierung.** Jede Liste schreibt Ansicht, Filter, Suche und
Sortierung in die Adresse und ersetzt dabei den aktuellen Verlaufseintrag; Neuladen stellt sie
wieder her. Quelle: ER-05. Offline: vollständig.

Betrifft: Essen (Rezepte und Restaurants), Aktivitäten, Haushalt („Anstehend / Alle / Verlauf“),
Artikel, Märkte („Märkte / Bereiche“), Feedback.

- AC-032: Angenommen Essen · Wenn ich „curry“ suche, „Vegetarisch“ wähle und nach „Am häufigsten“
  sortiere · Dann ist die Adresse `/rezepte?suche=curry&ernaehrung=vegetarisch&sortierung=haeufig` ·
  Wenn ich neu lade · Dann sind Suche, Filter und Sortierung wieder gesetzt und „Mango-Curry“ steht da.
- AC-033: Angenommen ich komme aus der Übersicht nach Essen und ändere dreimal den Filter · Wenn ich
  einmal „Zurück“ im Browser drücke · Dann bin ich auf der Übersicht.
- AC-034 (Rand): Angenommen `/rezepte?sortierung=quatsch&ernaehrung=fleisch` · Dann gilt „Zuletzt
  gekocht“ ohne Ernährungsfilter, und die Adresse wird zu `/rezepte` bereinigt.
- AC-035: Angenommen „Zufall“ ist gewählt · Wenn ich neu lade · Dann ist „Zufall“ gewählt und die
  Reihenfolge neu gemischt.

**REQ-012 — Kalender in der Adresse.** Ansicht, gewählter Tag (bestimmt Woche, Monat oder Jahr),
Tages-Fenster, Eintrag-Fenster und Hinzufügen-Fenster stehen in der Adresse; Blättern und Tag wählen
ersetzen, Fenster öffnen fügt hinzu. „Im Kalender planen“ und jeder andere Sprung in den Kalender
nutzen dieselbe Adresse. Quelle: ER-05. Offline: vollständig (lesen); Fenster mit Schreibvorgängen
sind offline wie bisher gesperrt.

- AC-036: Angenommen Monat, ich wähle den 9.12. und öffne das Tages-Fenster · Dann ist die Adresse
  `/kalender?ansicht=monat&tag=2026-12-09&fenster=tag` · Wenn ich neu lade · Dann ist der Dezember
  mit offenem Tages-Fenster für den 9.12. zu sehen.
- AC-037: Angenommen Woche · Wenn ich dreimal „›“ tippe und dann „Zurück“ im Browser · Dann verlasse
  ich den Kalender und lande, wo ich vorher war.
- AC-038: Angenommen die Übersicht zeigt Dienstag, 24.11. · Wenn ich „Im Kalender planen“ wähle ·
  Dann ist die Adresse `/kalender?tag=2026-11-24` · Und „Zurück“ zeigt die Übersicht mit dem 24.11.
- AC-039 (Rand): Angenommen `/kalender?tag=2026-13-40&ansicht=tag` · Dann zeigt der Kalender die
  Woche von heute in der Ansicht Woche, ohne Fehlermeldung.

**REQ-013 — Fenster in der Adresse.** Ein Fenster, das die Person öffnet, steht in der Adresse und
fügt einen Verlaufseintrag hinzu; „Zurück“, die Wischgeste zurück, Escape, Tipp daneben und ✕
schließen es gleich. Wurde die Adresse mit offenem Fenster geladen, entfernt ✕ das Fenster aus der
Adresse, ohne die App zu verlassen. Neuladen öffnet das Fenster wieder, ohne ungespeicherte Eingaben.
Quelle: ER-05. Offline: vollständig (öffnen und schließen); Speichern wie bisher.

- AC-040: Angenommen Haushalt · Wenn ich „Bad putzen“ öffne · Dann ist die Adresse
  `/haushalt?aufgabe=<ID von „Bad putzen“>` · Wenn ich „Zurück“ im Browser drücke · Dann ist das
  Fenster zu und ich bin weiter auf „Haushalt“.
- AC-041: Angenommen ich tippe in „Neue Aufgabe“ den Namen „Fenster Bad“ · Wenn ich neu lade · Dann
  ist „Neue Aufgabe“ offen und das Namensfeld leer.
- AC-042 (Rand): Angenommen ich öffne `/haushalt?aufgabe=<ID von „Bad putzen“>` direkt · Wenn ich ✕
  wähle · Dann ist die Adresse `/haushalt` und ich bin weiter in der App.

**REQ-014 — Auswahl in Liste und Detail.** Am Desktop steht das in Liste-und-Detail gewählte Objekt
in der Adresse und ersetzt den Eintrag; auf dem Handy öffnet derselbe Parameter das Fenster bzw. die
Detailseite und fügt einen Eintrag hinzu. Quelle: ER-05. Offline: vollständig.

Betrifft: Restaurants in Essen, Aufgaben und Verlauf in Haushalt, Artikel, Märkte, Reisetaschen,
Einstellungen.

- AC-043: Angenommen Desktop, Essen → Restaurants · Wenn ich „Trattoria Da Enzo“ wähle · Dann ist die
  Adresse `/rezepte?ansicht=restaurants&restaurant=<ID>` · Und nach dem Neuladen ist sie gewählt.
- AC-044 (Rand): Angenommen ich öffne diese Adresse auf dem Handy · Dann sehe ich die Restaurantseite
  „Trattoria Da Enzo“, und „Zurück“ führt zur Restaurantliste.

**REQ-015 — Kochmodus behält den Schritt.** Der Kochmodus schreibt den Schritt in die Adresse
(ersetzen); Neuladen zeigt denselben Schritt mit Variante und Portionen. Quelle: ER-05. Offline:
vollständig.

- AC-045: Angenommen ich koche „Lasagne“ mit 6 Portionen in Schritt 3 · Wenn ich neu lade · Dann zeigt
  der Kochmodus Schritt 3 von 6 Portionen.
- AC-046 (Rand): Angenommen `schritt=99` · Dann zeigt er den letzten Schritt.

**REQ-016 — Nach der Anmeldung zurück zur Adresse.** Wer abgemeldet eine Adresse der App öffnet,
sieht nach der Anmeldung genau diese Adresse; Ziel kann nur ein Pfad dieser App sein. Quelle: ER-05.
Offline: nur online (Anmelden braucht Netz, wie bisher).

- AC-047: Angenommen Enrico ist abgemeldet · Wenn er `/kalender?ansicht=monat&tag=2026-12-09` öffnet
  und sich mit Google anmeldet · Dann sieht er den Dezember mit dem 9.12.
- AC-048 (Fehler): Angenommen eine Adresse `/?weiter=https://boese.example` oder `//boese.example` ·
  Wenn Enrico sich anmeldet · Dann bleibt er in der App auf der Übersicht.
- AC-049 (Fehler): Angenommen die Anmeldung scheitert · Dann steht „Anmelden hat nicht geklappt“, und
  ein neuer Versuch führt wieder zur ursprünglichen Adresse.

**REQ-017 — Ids aus der Adresse sicher auflösen.** Eine Adresse zeigt nie Daten eines Haushalts, in
dem die Person nicht Mitglied ist; gehört eine Id zu einem anderen eigenen Haushalt, wechselt die App
dorthin und sagt es; eine unbekannte Id zeigt „nicht gefunden“, ungültige Parameter werden ignoriert.
Quelle: ER-05. Offline: vollständig (aus dem lokalen Speicher).

- AC-050: Angenommen Nadja schickt Enrico die Adresse eines Rezepts aus ihrem Haushalt „Nadjas WG“, in
  dem er nicht ist · Wenn er sie öffnet · Dann sieht er „Dieses Rezept gibt es nicht mehr“ und keinen
  Titel, kein Bild, keine Zutat.
- AC-051: Angenommen Enrico ist in „Test“, aktiv ist „Enrico & Nadja“ · Wenn er die Adresse eines
  Rezepts aus „Test“ öffnet · Dann ist „Test“ aktiv, das Rezept steht da, und ein Toast sagt
  „Haushalt „Test“ ist jetzt aktiv“.
- AC-052 (Rand): Angenommen `/kalender?eintrag=<unbekannte ID>` oder `/haushalt?aufgabe=abc` · Dann
  zeigt die Seite den Toast „Diesen Eintrag gibt es nicht mehr“ bzw. „Diese Aufgabe gibt es nicht
  mehr“, öffnet kein Fenster und entfernt den Parameter.
- AC-053 (Rand): Angenommen `/markt/abc` · Dann steht „Markt nicht gefunden“ (heute ohne Prüfung der
  Id).

**REQ-018 — Eine Liste aller Parameter.** Alle Namen und Werte stehen an einer Stelle in
`packages/core`; jede Seite liest und schreibt nur darüber, und neue Fenster folgen dem Anhang.
Quelle: ER-05. Offline: vollständig.

- AC-054: Angenommen der Code der App · Dann liest keine Seite einen Parameter, der nicht in dieser
  Liste steht (Test über alle `useLocalSearchParams`).
- AC-055 (Rand): Angenommen ein Wert enthält Leerzeichen oder Umlaute (`suche=müsli bowl`) · Dann wird
  er kodiert geschrieben und unverändert gelesen.

## Anhang — Parameter in der Adresse

Namen deutsch, klein, ohne Umlaut. Objekt-Parameter (`eintrag`, `aufgabe`, `verlauf`, `posten`,
`artikel`, `restaurant`, `markt`, `tasche`, `reise`) zeigen das Objekt: als Fenster auf dem Handy, als
Detail rechts am Desktop. `fenster=<name>` öffnet ein Fenster ohne eigenes Objekt.

| Seite                 | Zustand                                | Parameter                                                                                                                                       | Beispiel                                               |
| --------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Übersicht `/`         | gezeigter Tag                          | `tag`                                                                                                                                           | `/?tag=2026-11-24`                                     |
| Übersicht (0020)      | Hinzufügen-Fenster mit Tageszeit       | `fenster=neu-eintrag`, `zeit=<Tageszeit-ID>`                                                                                                    | `/?tag=2026-11-24&fenster=neu-eintrag&zeit=<ID Abend>` |
| Übersicht             | „Was hast du erledigt?“                | `fenster=erledigt`                                                                                                                              | `/?fenster=erledigt`                                   |
| Kalender `/kalender`  | Ansicht, Tag                           | `ansicht=woche\|monat\|jahr`, `tag`                                                                                                             | `/kalender?ansicht=monat&tag=2026-12-09`               |
| Kalender              | Tages-Fenster, Eintrag, Hinzufügen     | `fenster=tag`, `eintrag`, `fenster=neu-eintrag&zeit`                                                                                            | `/kalender?tag=2026-11-25&eintrag=<ID>`                |
| Kalender (0022)       | Reise-Fenster, neue Reise              | `reise`, `fenster=neu-reise`                                                                                                                    | `/kalender?ansicht=monat&tag=2026-12-04&reise=<ID>`    |
| Kalender              | „Auf die Einkaufsliste“                | `fenster=vorratscheck`                                                                                                                          | `/kalender?tag=2026-11-25&fenster=vorratscheck`        |
| Essen `/rezepte`      | Ansicht, Suche, Filter, Sortierung     | `ansicht=rezepte\|restaurants`, `suche`, `art`, `favoriten=1`, `ernaehrung`, `dauer`, `fuer-alle=1`, `selten=1`, `gang`, `kueche`, `sortierung` | `/rezepte?suche=curry&sortierung=haeufig`              |
| Essen                 | Neu; Restaurant gewählt/neu            | `fenster=neu\|neu-restaurant`, `restaurant`, `link`, `name`                                                                                     | `/rezepte?ansicht=restaurants&restaurant=<ID>`         |
| Rezept `/rezept/[id]` | Herkunft, Portionen, Variante, Fenster | `von`, `portionen`, `variante`, `fenster=einplanen\|sammlung\|vorratscheck`                                                                     | `/rezept/<ID>?von=uebersicht&portionen=6`              |
| Kochmodus             | Schritt, Variante, Portionen           | `schritt`, `variante`, `portionen`                                                                                                              | `/rezept/<ID>/kochen?schritt=3&portionen=6`            |
| Restaurant (0024)     | Einplanen-Fenster, Route               | `fenster=einplanen\|route`, `von`                                                                                                               | `/restaurant/<ID>?fenster=einplanen`                   |
| Aktivitäten (0024)    | Suche, Favoriten, Sortierung, Auswahl  | `suche`, `favoriten=1`, `sortierung`, `aktivitaet`, `fenster=neu-aktivitaet\|einplanen`                                                         | Pfad nach 0024                                         |
| Liste `/liste`        | Posten, Vorratscheck                   | `posten`, `fenster=vorratscheck`                                                                                                                | `/liste?posten=<ID>`                                   |
| Liste (0025)          | „Aus Kalender“ mit Startdatum          | `fenster=aus-kalender`, `tag`                                                                                                                   | `/liste?fenster=aus-kalender&tag=2026-11-29`           |
| Haushalt `/haushalt`  | Ansicht, Aufgabe, Verlauf, Neu         | `ansicht=anstehend\|alle\|verlauf`, `aufgabe`, `verlauf`, `fenster=neu-aufgabe\|erledigt`                                                       | `/haushalt?ansicht=alle&aufgabe=<ID>`                  |
| Artikel `/artikel`    | Filter, Suche, Sortierung, Auswahl     | `filter`, `suche`, `sortierung=name\|neu`, `artikel`, `fenster=neu-artikel`, `von`                                                              | `/artikel?filter=ohne-bereich&artikel=<ID>`            |
| Märkte `/maerkte`     | Ansicht, Markt                         | `ansicht=maerkte\|bereiche`, `markt`                                                                                                            | `/maerkte?markt=<ID>`                                  |
| Reisetaschen          | Tasche                                 | `tasche`                                                                                                                                        | `/reisetaschen?tasche=<ID>`                            |
| Einstellungen         | Abschnitt                              | `abschnitt`                                                                                                                                     | `/einstellungen?abschnitt=<Abschnitt>`                 |
| Feedback              | Status-Filter                          | `filter`                                                                                                                                        | `/feedback?filter=<Status>`                            |
| Benachrichtigung      | Haushalt wechseln (einmalig)           | `haushalt` (wird nach dem Wechsel entfernt)                                                                                                     | `/kalender?tag=2026-11-25&eintrag=<ID>&haushalt=<ID>`  |

Regel für neue Fenster: Ein neues Fenster bekommt `fenster=<name>` (Verb oder `neu-<objekt>`) oder,
wenn es ein Objekt zeigt, dessen Objekt-Parameter; es wird in die Liste in `packages/core`
eingetragen. `/teilen?url&text` bleibt (Namen des Web-Share-Ziels).

## Entscheidungen

Alle von Claude nach Enricos Regel „Empfehlung nehmen“ (22.11.2026).

1. Bereich wählen zeigt die Startseite „wie zuletzt verlassen“ (Ansicht, Filter, Suche bleiben aus
   Spec 0008 E14), ohne Fenster und Detailseite. Empfehlung, weil ER-07 nur das Landen im Rezept
   rügt und Filter erhalten bleiben sollen. Alternative „immer Grundzustand“ verworfen.
2. Herkunft als `von` in der Adresse statt nur im Verlauf: überlebt Neuladen und deckt X-05
   (Beschriftung und Hervorhebung). Hervorgehoben wird der Bereich der Herkunft.
3. Objekt-Parameter öffnen ihr Fenster (wie `eintrag` aus Benachrichtigungen), `fenster=` nur für
   Fenster ohne Objekt: ein Schema für Handy-Fenster und Desktop-Detail.
4. Fenster öffnen = neuer Verlaufseintrag; Filter, Suche, Sortierung, Ansicht, Blättern, Auswahl am
   Desktop = ersetzen. Grund: „Zurück“ schließt Fenster, springt aber nicht durch Einstellungen.
5. Parameter bleiben in der Adresse stehen; heute werden `tag` und `eintrag` nach dem Lesen
   gelöscht (`apps/app/src/lib/target-params.ts`). Nur `haushalt` wird weiter nach dem Wechsel
   entfernt. Spec 0013 AC-037/AC-038 gelten unverändert.
6. Umbenannt ohne Weiterleitung: `view` → `ansicht`, `rid` → `restaurant`, `add=1` →
   `fenster=neu-restaurant`, `share`/`shareName` → `link`/`name`, `variant` → `variante`.
7. Id aus einem anderen eigenen Haushalt: wechseln mit Toast (der lokale Speicher hält alle eigenen
   Haushalte, `packages/api/src/store.ts`). Alternative „`haushalt` an jeder Adresse“ verworfen
   (lange Adressen); „nicht gefunden“ verworfen (eigene Daten wären unerreichbar).
8. Rückkehr nach der Anmeldung: Pfad mit Suchteil vor dem Start der Google-Anmeldung im
   Sitzungsspeicher merken, nur wenn er mit genau einem `/` beginnt; `redirectTo` bleibt die Wurzel
   (keine neue Supabase-Freigabe nötig).
9. Tippflächen: 44 pt bei Finger, 24 px bei Maus (WCAG 2.5.8), damit Kalender-Raster am Desktop
   dicht bleiben.
10. X-03 Liste: „+“ offline über die bestehende Aktion „Posten hinzufügen“ der
    Laden-Warteschlange, „−“ bleibt online; Grund: hinzufügen geht offline schon per Eintippen.
    Ändert 0025 die Mengenbedienung (L-01), gilt weiter: hinzufügen offline, verringern online.
11. Filter-Fenster, Menüs, „Haushalt wechseln“, Assistent und Fragen der App stehen nicht in der
    Adresse: Sie sind Auswahl oder Rückfrage, kein Ort.
12. Ändert ältere Kriterien: Banner-Text in Spec 0001 AC-010 und 0003 AC-004 wird „Offline – Lesen,
    Einkaufen und Packen gehen“; Spec 0011 AC-008 (Rückweg behält den Tag) gilt jetzt über die
    Adresse; Spec 0005 AC-002 (Hervorhebung bei Detailseiten) folgt der Herkunft.
13. OFFEN: ER-35 („oben ist etwas gebleut“) beschreibt Enrico noch genauer. Annahme: Die Fläche unter
    der Statusleiste hat die falsche Farbe, oder Inhalt scheint beim Scrollen durch. REQ-008 deckt
    beides; passt es nicht, ergänzt Enrico.
14. OFFEN: Wie iOS die Statusleiste einer installierten Web-App bei `theme-color` je Farbschema und
    `apple-mobile-web-app-status-bar-style` färbt, wird auf Enricos iPhone geprüft (Emulation zeigt es
    nicht). AC-023 ist das Ziel; die Meta-Kombination legt die Umsetzung fest.

## Daten

Keine Datenbank-, RLS- oder Sync-Änderung. Neu im Sitzungsspeicher des Browsers: die Zieladresse
vor der Anmeldung (nur Pfad, wird danach gelöscht). Die Adresse enthält nur Ids und den eigenen
Suchtext, keine Namen.
Entfällt: `focusRing` als eigene Funktion (nur noch der Tastatur-Rahmen), die Modul-Speicher
`recipe-list-state.ts` und `restaurant-list-state.ts`, soweit die Adresse sie ersetzt, das Löschen
der Parameter in `target-params.ts`, die Parameter `view`, `rid`, `add`, `share`, `shareName`,
`variant`.

## Risiken

| Risiko                                                    | Gegenmaßnahme                                                     | Test                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| Offene Weiterleitung nach der Anmeldung                   | Nur Pfade mit genau einem führenden `/`, kein Schema, kein `//`   | Unit `AC-048` in `core`                      |
| Adresse zeigt Daten eines fremden Haushalts               | Auflösen nur im lokalen Speicher der eigenen Haushalte            | Unit `AC-050`; pgTAP-Isolation unverändert   |
| Wechsel in einen Haushalt per Adresse ohne Mitgliedschaft | Wechsel nur, wenn die Id in einem eigenen Haushalt liegt          | Unit `AC-051` mit fremder Id                 |
| Abgemeldet: Adresse verrät Inhalte                        | Anmeldeseite zeigt nichts aus der Adresse                         | `AC-047` abgemeldet                          |
| Ungültige Parameter lassen eine Seite abstürzen           | Zod-Prüfung je Parameter in `core`, ungültig = ignorieren         | Unit `AC-034`, `AC-039`, `AC-052`            |
| „+“ offline doppelt oder verloren                         | Bestehende Aktion „Posten hinzufügen“ mit Client-Id, Wiederholung | `AC-030`, `AC-031`; Abbruch mitten im Senden |

## Umsetzung

- [ ] 1. `packages/ui`: eine Funktion für den Tastatur-Fokusrahmen, alle Bausteine darauf; Rahmen
      nicht abgeschnitten (AC-004–AC-006).
- [ ] 2. `packages/ui`: `Text` standardmäßig nicht markierbar, Inhalt ausdrücklich markierbar;
      `-webkit-touch-callout` an Bedienelementen (AC-001–AC-003).
- [ ] 3. `packages/ui`: Hover nur mit `hover: hover` und `pointer: fine`, Hover für Kacheln, Zeilen,
      Chips, Tagesleiste (AC-007, AC-008).
- [ ] 4. `Menu` und `Popover`: Lage beim Ausblenden halten, Fokus nur bei Tastatur (AC-009–AC-011).
- [ ] 5. Navigation: Bereich → Startseite, `von` an allen Detailseiten, Hervorhebung, Haushaltszeile,
      Gruppennamen (AC-012–AC-021).
- [ ] 6. `index.html`, Manifest, Theme: `viewport-fit=cover`, `theme-color` je Theme und zur
      Laufzeit, Hintergrund vor dem Start; Insets an Toast, Einkaufsmodus, Fenster, Tages-Fenster
      (AC-022–AC-025). Auf Enricos iPhone prüfen.
- [ ] 7. Tippflächen, Overscroll, Text-Size-Adjust (AC-026–AC-028).
- [ ] 8. Offline-Banner, ein Hinweis je Bildschirm, „+“ über die Laden-Warteschlange (AC-029–AC-031).
- [ ] 9. `packages/core`: Liste aller Parameter mit Zod-Prüfung; Hilfen zum Lesen, Ersetzen,
      Hinzufügen (AC-054, AC-055).
- [ ] 10. Listen, Kalender, Fenster, Auswahl, Kochmodus auf die Adresse umstellen (AC-032–AC-046).
- [ ] 11. Rückkehr nach der Anmeldung, Ids sicher auflösen (AC-047–AC-053); `/security-check`.
- [ ] Aufräumen: `focusRing`, Modul-Speicher der Listen, Löschen der Parameter in
      `target-params.ts`, alte Parameternamen.
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web`; `/ui-verify` Handy und Desktop,
      hell und dunkel; iPhone als installierte Web-App.
