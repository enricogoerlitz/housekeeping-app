---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0047 — Feinschliff: Teilen, Foto-Fenster, „+ Link“, Foto im Plan-Eintrag, Schnellansicht

**Quelle:** Enricos Rückmeldung zur Vorschau vom 26.11.2026 abends (Batch 3); die Rückmeldung ist
die Freigabe. **Kritischer Pfad:** nein (keine Migration, keine Rechte, kein Sync).

## Ziel

Teilen schickt nur den Link in die App, mit einem kleineren Symbol. Das Foto-Fenster hat auf dem
Handy einen einzigen Knopf, weil das iPhone ohnehin selbst fragt (Mediathek, Kamera, Datei). Im
Lesemodus eines Rezepts lege ich einen Link so direkt an wie eine Zutat. Ein Plan-Eintrag mit Foto
zeigt das Foto oben, und die Rezept-Schnellansicht am Desktop hat ein Foto in der Größe der
Restaurants.

## Nicht-Ziele

- Kein lesbarer Text, kein Titel und kein Foto mehr beim Teilen; kein öffentlicher Link für
  Nicht-Mitglieder (wie Spec 0042).
- Keine eigene Mediathek-/Kamera-Auswahl in der App; das Menü kommt vom System.
- Keine Fotos für Text- und Reste-Einträge im Plan; kein Foto-Ändern im Plan-Eintrag.
- Die Rezeptseite selbst (Desktop zweispaltig, Handy) behält ihr Foto; die Galerie baut Spec 0046.

## Anforderungen

Haushalt „Enrico & Nadja“; Rezept „Mango-Curry“ mit Foto, Restaurant „AMRIT“ mit Foto.

### Teilen

**REQ-001 — Nur der Link.** „Teilen“ (Rezept, Sammlung, Restaurant, Aktivität; Symbol unter dem
Foto und im Menü „Mehr“) gibt dem Teilen-Menü des Geräts nur die Adresse der Seite in der App; am
Desktop ohne Teilen-Menü wird die Adresse kopiert. Das Symbol ist kleiner (32 statt 40 pt), die
Tippfläche bleibt 44 × 44 pt. Quelle: Enrico, „nur den Link geben, nicht noch anderen Krams; und
Button kleiner“. Offline: offline vollständig.

- AC-001: Angenommen „Mango-Curry“ · Wenn ich „Teilen“ tippe · Dann bekommt das Teilen-Menü genau
  `{ url: "<Adresse der App>/rezept/<id>" }`, ohne Titel, Text und Foto
- AC-002: Angenommen „AMRIT“, die Sammlung „Grillabend“, die Aktivität „Eislaufen“ · Dann ist die
  Adresse `/restaurant/<id>`, `/rezept/<id>`, `/aktivitaet/<id>`
- AC-003: Angenommen Desktop ohne Teilen-Menü · Wenn ich „Teilen“ tippe · Dann ist die Adresse
  kopiert, und die App sagt „Link kopiert“
- AC-004: Angenommen das Kopieren scheitert oder es gibt keine Adresse · Dann sagt die App „Teilen
  hat nicht geklappt.“; bricht man das Teilen-Menü ab, passiert nichts
- AC-005: Angenommen die Seite von „AMRIT“ · Dann ist das Symbol „Teilen“ 32 pt groß, und seine
  Tippfläche misst 44 × 44 pt

### Foto-Fenster

**REQ-002 — Ein Knopf auf Touch-Geräten.** Im Fenster „Foto“, Ansicht „Bild wählen“, steht auf dem
Handy und auf Touch-Geräten nur noch der Knopf „Foto auswählen“, der das System-Menü öffnet; dazu
„Bildadresse“. Mit Maus oder Trackpad bleiben der Hinweis zum Ziehen und Einfügen, „Datei wählen“
und „Bildadresse“. Ersetzt Spec 0039, REQ-004 und AC-009. Quelle: Enrico, „man braucht nur einen
Button … man bekommt eh einen Dialog vom iPhone“. Offline: nur online (wie bisher deaktiviert).

- AC-006: Angenommen Handy 390 × 844 · Wenn ich „Foto ändern“ tippe · Dann zeigt „Bild wählen“
  genau einen Knopf „Foto auswählen“ und das Feld „Bildadresse“
- AC-007: Angenommen iPhone · Wenn ich „Foto auswählen“ tippe · Dann öffnet iOS sein Menü mit
  „Fotomediathek“, „Foto aufnehmen“ und „Datei auswählen“ (nur am iPhone prüfbar)
- AC-008: Angenommen Desktop mit Maus · Dann zeigt „Bild wählen“ den Hinweis „Bild hierher ziehen,
  mit ⌘V einfügen oder eine Datei wählen“, „Datei wählen“ und „Bildadresse“
- AC-009: Angenommen offline · Dann ist „Foto auswählen“ deaktiviert mit dem Offline-Hinweis

### Rezept-Lesemodus

**REQ-003 — „+ Link“.** Unter „Links“ steht im Lesemodus „+ Link“ wie „+ Zutat“: es öffnet den
Bearbeitungsmodus mit dem Fenster „Link“. Gilt für Rezepte und Sammlungen. Quelle: Enrico, „wie auch

- Zutat hinzufügen, auch Link direkt hinzufügen können“. Offline: offline lesend (Bearbeiten
  braucht Netz).

* AC-010: Angenommen „Mango-Curry“ ohne Links im Lesemodus · Dann steht unter „Noch keine Links.“
  der Knopf „+ Link“
* AC-011: Angenommen „Mango-Curry“ · Wenn ich „+ Link“ tippe · Dann ist die Seite im
  Bearbeitungsmodus, das Fenster „Link“ ist offen, und „Abbrechen“ im Fenster lässt den
  Bearbeitungsmodus offen
* AC-012: Angenommen offline · Dann ist „+ Link“ deaktiviert mit dem Offline-Hinweis
* AC-013: Angenommen „Mango-Curry“ hat 10 Links · Dann ist „+ Link“ deaktiviert mit „Höchstens 10
  Links“

### Kalender

**REQ-004 — Foto im Plan-Eintrag.** Das Fenster eines Plan-Eintrags zeigt oben zentriert das Foto
des Rezepts (eigenes oder Beispielfoto), der Sammlung (eigenes oder Collage ihrer Rezepte), des
Restaurants oder der Aktivität; darunter „… öffnen“ und „Route“. Ohne Foto fehlt der Bereich ganz,
ohne Platzhalter. Quelle: Enrico, „oben einmal das Foto zentriert anzeigen … nur anzeigen, wenn es
eins gibt“. Offline: offline vollständig (Foto aus dem Gerätespeicher).

- AC-014: Angenommen „AMRIT“ mit Foto steht am Freitag im Plan · Wenn ich den Eintrag öffne · Dann
  steht oben mittig das Foto, darunter „Restaurant öffnen“ und „Route“
- AC-015: Angenommen „Mango-Curry“ oder die Sammlung „Grillabend“ (Rezepte mit Fotos) im Plan ·
  Dann zeigt das Fenster das Foto bzw. die Collage
- AC-016: Angenommen eine Aktivität ohne Foto, ein Text-Eintrag oder Reste · Dann zeigt das Fenster
  kein Bild und keinen Platzhalter
- AC-017: Angenommen das eigene Foto ist nicht auf dem Gerät und lädt nicht (offline) · Dann zeigt
  das Fenster kein Bild und keinen Platzhalter

### Schnellansicht

**REQ-005 — Rezeptfoto wie beim Restaurant.** In der Rezept-Schnellansicht am Desktop (Liste) und
auf der Rezeptseite am Tablet ist das Foto höchstens so hoch wie das Restaurantfoto dort (315 px)
und steht links; „Foto ändern“ und „Teilen“ stehen darunter in seiner Breite. Am Handy bleibt es über
die ganze Breite. Quelle: Enrico, „Bild VIEL zu groß. Mach mal lieber wie bei Restaurants!“.
Offline: offline vollständig.

- AC-018: Angenommen Desktop 1440 × 900, Rezepte „Liste“, „Mango-Curry“ in der Schnellansicht ·
  Dann ist das Foto 420 × 315 px, so hoch wie das Foto von „AMRIT“ in der Schnellansicht
- AC-019: Angenommen Handy 390 × 844, Seite von „Mango-Curry“ · Dann reicht das Foto über die ganze
  Breite (wie bisher)

## Entscheidungen

1. Bau, 26.11.: Der Knopf heißt „Foto auswählen“: „Foto“ deckt Mediathek und Kamera ab (mehr als
   „Datei“), „auswählen“ ist das Wort des iPhone-Menüs („Datei auswählen“). „Touch-Gerät“ heißt:
   Handy-Breite oder kein feiner Zeiger (`useFinePointer`); dort entfällt auch der Hinweis zum
   Ziehen. Die Test-ID `…-photo-window-file` bleibt für beide Knöpfe.
2. Bau, 26.11.: Geteilt wird `{ url }` allein (iOS hängt sonst den Titel an); am Desktop sagt die
   App „Link kopiert“ statt „Kopiert“. Die Texte aus Spec 0042 (`share-text.ts`) und das Mitschicken
   des Fotos entfallen; ersetzt Spec 0042, AC-008 bis AC-010 und Entscheidung 3.
3. Bau, 26.11.: Die Adresse baut `core.shareLink(origin, target)`; ohne Adresse der App (keine
   Web-Plattform) gibt es keinen Link → AC-004.
4. Bau, 26.11.: Schnellansicht: 4:3 bleibt (Rezeptfotos werden 4:3 erzeugt und nicht beschnitten);
   die Breite ist höchstens 420 px, damit die Höhe der des Restaurantfotos (560 px breit, 16:9 =
   315 px) entspricht. Gilt in der Schnellansicht und am Tablet, für Rezepte und Sammlungen.
5. Bau, 26.11.: Im Plan-Eintrag ist das Foto höchstens 280 px breit, mittig, im Seitenverhältnis
   seiner Quelle (Rezept 4:3, Restaurant/Aktivität 16:9); es erscheint erst, wenn es geladen ist
   (kein leerer Rahmen). Welche Quelle infrage kommt, sagt `core.planEntryPhoto`.

## Daten

Nur Lesen aus dem lokalen Speicher (Fotos, Rezepte, Restaurants, Aktivitäten). Keine
Schema-Änderung. Entfällt: der Teilen-Text (`packages/core/src/share-text.ts`) und das Foto beim
Teilen.

## Umsetzung

- [x] 1. `core.shareLink` rot → grün; Teilen nur mit Link, Symbol 32 pt mit `IconButton`
      `touchFrame` (react-native-web kennt kein `hitSlop`) (AC-001–AC-005)
- [x] 2. Foto-Fenster: ein Knopf auf Touch-Geräten (AC-006–AC-009)
- [x] 3. „+ Link“ im Lesemodus über den Bearbeitungsmodus (AC-010–AC-013)
- [x] 4. `core.planEntryPhoto` rot → grün; Foto oben im Plan-Eintrag (AC-014–AC-017)
- [x] 5. Schnellansicht: Rezeptfoto höchstens 420 px breit (AC-018, AC-019)
- [x] 6. Screenshots Handy 390 × 844 und Desktop 1440 × 900 vorher/nachher in
      `tmp/review-0003/0047/`
- [x] Nachweis (26.11.): Vitest rot (Module fehlten, `touchFrame` 32 statt 44 px) → grün;
      `pnpm format:check && pnpm check && pnpm build:web` grün (core 1791, ui 1057, api 1020
      Tests). Dev-Server 8094: geteilt wird nur `http://localhost:8094/rezept/<id>` („Link
      kopiert“), Teilen-Tippfläche 44 × 44 bei 32 pt Kreis, Schnellansicht-Foto 420 × 315 wie
      „Trattoria Da Enzo“ 560 × 315, Foto im Plan-Eintrag bei Rezept, Sammlung (Collage) und
      Restaurant, keins bei Aktivität ohne Foto und Resten; keine Konsolenfehler.
      `/security-check`: keine Befunde (geprüft: Link aus `location.origin` + kodierter ID, nur
      Text in die Zwischenablage, Datei weiter über `checkImageFile`, Link weiter über
      `validateLink`, Fotos nur aus dem lokalen Speicher). Nur am iPhone prüfbar: AC-007
      (System-Menü), Teilen-Menü mit nur dem Link.
