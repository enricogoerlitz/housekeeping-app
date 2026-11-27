---
status: freigegeben
datum: 2026-11-26
---

# 0044 — Tastatur und Fenster auf dem iPhone

**Quelle:** Enricos Test der Vorschau auf dem iPhone (PWA), 26.11.2026 abends: „wenn ich rezept
bearbeiten klicke, und dann in titel gehe -> man sieht nach öffnen der tastatur nicht das feld“,
„öffnen von der tastatur kann man noch einiges optimieren“; Video 3 (72 s), Befunde Bild für Bild
in `tmp/review-0003/batch3/video-befunde-3.md`. Freigabe: Enricos Rückmeldung. **Kritischer
Pfad:** nein.

## Ziel

Wer auf dem iPhone tippt, sieht immer das Feld, in dem der Cursor steht, ganz und mit etwas Luft,
eher im oberen Drittel des sichtbaren Bereichs. Ein Fenster mit Tastatur bewegt sich einmal an
seinen Platz auf der Tastatur und bleibt dort; beim Schließen gehen Fenster und Tastatur zusammen.
Die Seite samt Kopfzeile springt beim Wechsel zwischen Feldern nicht. Die App startet ohne weißen
Blitz.

## Nicht-Ziele

- Keine native App; es bleibt die PWA. Safaris Leiste über der Tastatur (˄ ˅ ✓) bleibt.
- Android und der Desktop ändern ihr Verhalten nicht (Android verkleinert das Layout selbst, Spec
  0032, Entscheidung 2).
- Kein eigenes Abfangen des ersten Fingertipps auf ein Feld (`touchend` mit Verschieben des
  Felds, wie Base UI es macht): Entscheidung 4.
- Keine neue Startseite mit Logo; der Start zeigt nur die Hintergrundfarbe der App.

## Schon erledigt

- Tastatur erkennen, App-Höhe auf den sichtbaren Bereich, Seite zurückscrollen (Spec 0032,
  `keyboard.web.ts`); Tastatur im Tipp öffnen (Spec 0033, Entscheidung 10, `keyboard-proxy.web.ts`).
- Hintergrund der App vor dem ersten Bild in `index.html` und `theme-boot.js` (Spec 0019, AC-025).

## Anforderungen

### Start

**REQ-001 — Start ohne weißen Blitz.** Vom Antippen des Symbols bis zur ersten Seite zeigt das
iPhone die Hintergrundfarbe der App (hell bzw. dunkel nach Systemeinstellung), kein Weiß. Quelle:
Video 3, Befund 1. Offline: offline vollständig.

- AC-001: Angenommen `index.html` · Dann verweist sie für jede iPhone-Bildschirmgröße (hochkant)
  auf ein Startbild hell und eins dunkel, und jedes Bild existiert, hat genau die Pixelgröße seiner
  Abfrage und ist einfarbig `#FAF6EE` (hell) bzw. `#1B1613` (dunkel)
- AC-002 (nur am iPhone prüfbar): Angenommen die App ist vom Home-Bildschirm aus beendet · Wenn ich
  sie öffne · Dann ist der Bildschirm bis zur Übersicht beige (bzw. dunkel), nicht weiß

### Fenster und Tastatur

**REQ-002 — Ein Fenster mit Tastatur bewegt sich einmal.** Geht mit einem Fenster die Tastatur auf,
gleitet das Fenster in einer Bewegung an seinen Platz auf der Tastatur und bleibt dort; die Seite
dahinter verschiebt sich nicht. Quelle: Video 3, Befunde 2 und 6. Offline: offline vollständig.

- AC-003: Angenommen Handy 390 × 844, Tastatur zu, ein Fenster offen · Wenn der sichtbare Bereich
  auf 464 px schrumpft · Dann steht das Fenster sofort (ohne Warten) 380 px über der Unterkante
- AC-004: Angenommen „Neu → Rezept“ wurde getippt und die Tastatur war zuletzt 380 px hoch · Wenn
  das Fenster erscheint, bevor die Tastatur da ist · Dann steht es schon 380 px über der Unterkante,
  und wenn die Tastatur dann mit 380 px kommt, bewegt es sich nicht mehr
- AC-005: Angenommen dasselbe ohne gemessene Tastatur (erster Start) · Dann rechnet das Fenster mit
  45 % der Fensterhöhe (380 px bei 844 px)
- AC-006: Angenommen „Neu → Rezept“ wurde getippt · Wenn 1,5 s lang keine Tastatur kommt · Dann
  steht das Fenster wieder an der Unterkante
- AC-007: Angenommen die Tastatur ist offen · Wenn sich ihre Höhe in Schritten ändert (Vorschläge
  erscheinen) · Dann übernimmt das Fenster die neue Höhe einmal, wenn sie zur Ruhe gekommen ist
- AC-008: Angenommen iOS hat den sichtbaren Bereich (464 px) um 120 px nach unten geschoben · Dann
  endet das Fenster an der Unterkante des sichtbaren Bereichs (260 px über der Unterkante des Layouts)

**REQ-003 — Fenster und Tastatur gehen zusammen.** Wird ein Fenster mit offener Tastatur
geschlossen, geht die Tastatur sofort mit; nichts bleibt mitten im Bild stehen. Quelle: Video 3,
Befund 6. Offline: offline vollständig.

- AC-009: Angenommen Fenster „Link“ mit Cursor in „Adresse“ · Wenn ich „Abbrechen“ tippe · Dann hat
  kein Feld des Fensters mehr den Cursor, noch während es hinausgleitet
- AC-010: Angenommen die Tastatur ist offen · Wenn der sichtbare Bereich wieder die ganze Höhe hat
  · Dann steht das Fenster sofort an der Unterkante, und die Seite ist ganz oben (iOS 26 lässt sie
  sonst verschoben, Entscheidung 3)

### Das Feld mit dem Cursor

**REQ-004 — Das Feld mit dem Cursor ist ganz zu sehen.** Bekommt ein Feld den Cursor (Antippen,
˄ ˅ der Tastatur, Fenster öffnet sich), scrollt der Bereich, in dem es steht (Seite oder Fenster),
so, dass es ganz und mit 16 px Luft im sichtbaren Teil steht — liegt es nicht schon so da, kommt es
ins obere Drittel. Nur dieser Bereich scrollt, nie die ganze Seite. Quelle: Video 3, Befunde 3, 4
und 6. Offline: offline vollständig.

- AC-011: Angenommen ein Bereich von 100 bis 464 px ist sichtbar · Wenn ein 44 px hohes Feld bei
  700 px den Cursor bekommt · Dann scrollt der Bereich so, dass das Feld bei 212 px beginnt
  (100 + 16 + (332 − 44) / 3)
- AC-012: Angenommen dasselbe · Wenn das Feld schon bei 300 px steht · Dann scrollt nichts
- AC-013: Angenommen dasselbe · Wenn das Feld bei 430 px steht (halb unter der Leiste der
  Tastatur) · Dann kommt es ebenfalls nach 212 px
- AC-014: Angenommen ein Feld (Beschreibung) ist höher als der sichtbare Teil · Dann beginnt es
  16 px unter dessen Oberkante
- AC-015: Angenommen der Bereich ist schon ganz unten bzw. oben · Dann scrollt er höchstens bis
  zu seinem Ende und nie unter 0
- AC-016: Angenommen Rezept im Bearbeiten-Modus, „Titel“ steht unter der künftigen Tastatur · Wenn
  ich „Titel“ antippe und die Tastatur aufgeht · Dann steht „Titel“ im sichtbaren Teil der Seite
- AC-017: Angenommen die Tastatur ist offen, der Cursor in „Titel“ · Wenn er in ein Feld unter der
  Tastatur wandert · Dann steht das neue Feld danach im sichtbaren Teil
- AC-018: Angenommen Fenster „Link“ mit Tastatur · Wenn der Cursor in „Bezeichnung“ wandert, die
  unter der Tastatur liegt · Dann scrollt der Inhalt des Fensters, nicht die Seite dahinter
- AC-019: Angenommen keine Tastatur (Desktop) · Wenn ein Feld den Cursor bekommt · Dann scrollt die
  App nichts selbst

**REQ-005 — Die Seite springt beim Feldwechsel nicht.** Wandert der Cursor auf dem iPhone von
einem Feld zum nächsten (Antippen, ˄ ˅, Text- zu Zifferntastatur), verschiebt Safari die Seite
nicht; das Scrollen übernimmt REQ-004. Quelle: Video 3, Befund 5. Offline: offline vollständig.

- AC-020: Angenommen iPhone, Cursor in „Titel“ · Wenn er nach „Portionen“ wandert · Dann bekommt
  „Portionen“ den Fokus ohne Scrollen des Browsers (`preventScroll`)
- AC-021: Angenommen kein iPhone oder iPad · Wenn der Cursor wandert · Dann greift die App nicht ein
- AC-022 (nur am iPhone prüfbar): Angenommen Rezept im Bearbeiten-Modus · Wenn ich mit ˄ ˅ durch
  „Titel“, „Portionen“, „Zeit“, „Küche“, „Schlagworte“ gehe · Dann bleibt die Kopfzeile stehen, und
  jedes Feld steht ganz über der Leiste der Tastatur

### Lesemodus

**REQ-006 — „Noch keine Zutaten“ oben rechts.** Geprüft: kein Fehler. Der kleine Hinweis gehört zu
„Auf die Liste“ (ausgegraut, Spec 0006, AC-060) und steht unter dem Knopf; nach dem Scrollen liegen
die Knöpfe unter der Kopfzeile, der Hinweis darunter ist noch zu sehen. Er bleibt. Quelle: Video 3,
Befund 7. Offline: offline vollständig.

- AC-023: Angenommen Rezept ohne Zutaten im Lesemodus · Dann steht „Noch keine Zutaten“ unter
  „Auf die Liste“ und „Noch keine Zutaten.“ unter „Zutaten“ (unverändert)

## Entscheidungen

1. **Ein Mechanismus in `packages/ui` statt Flicken je Seite.** `keyboard.web.ts` hört (solange die
   App läuft) auf `visualViewport` und auf den Fokus und scrollt das Feld mit dem Cursor im nächsten
   Scroll-Bereich; die Geometrie (`keyboard-reveal.ts`) ist rein und getestet. Vorbild: React Aria
   `usePreventScroll` (Stand Okt. 2026: „When using the next/previous buttons … the whole page
   always scrolls“; Abhilfe: das neue Feld während `blur` mit `preventScroll` fokussieren und selbst
   scrollen, Feld in die Mitte des sichtbaren Teils) und Base UI `DrawerVirtualKeyboardProvider`
   1.6 (Fenster unten = `innerHeight − visualViewport.bottom`, Feld nach `focusin` im nächsten
   Scroll-Bereich zentrieren). Quellen:
   github.com/adobe/react-spectrum `packages/react-aria/src/overlays/usePreventScroll.ts`, PR #8888
   („Improve behavior of modals on iOS 26“), `utils/runAfterKeyboard.ts`;
   unpkg.com/@base-ui/react@1.6.0/drawer/virtual-keyboard-provider. Oberes Drittel statt Mitte, weil
   unter einem Suchfeld noch Vorschläge Platz brauchen (Enricos Wunsch „eher oberes Drittel“).
2. **Tastatur auf und zu sofort, Zwischenhöhen nach Ruhe.** WebKit meldet beim Aufgehen ein
   einziges `resize` mit der Endhöhe am Anfang der Bewegung (React Aria, `runAfterKeyboard`); das
   Warten auf Ruhe (Spec 0033, REQ-003) ließ das Fenster erst nach Safaris eigenem Verschieben
   folgen — die drei Stellungen im Video. Jetzt: Wechsel zu/auf (und von der erwarteten zur
   gemessenen Tastatur) gelten sofort, weitere Höhen bei offener Tastatur nach 120 ms Ruhe. Das
   Fenster gleitet mit 250 ms auf die neue Höhe. Ändert Spec 0033, AC-008: der erste Schritt gilt
   sofort, nur die folgenden warten.
3. **Unterkante des sichtbaren Bereichs inklusive Verschiebung.** Die Tastaturhöhe ist
   `Fensterhöhe − (offsetTop + sichtbare Höhe)`; offen ist sie wie bisher ab 150 px Unterschied.
   iOS 26 setzt `visualViewport.offsetTop` nach dem Schließen nicht immer auf 0 zurück (Apple
   Developer Forums, Thread 800125); die Seite wird beim Schließen sofort und nach Ruhe noch einmal
   nach oben gesetzt.
4. **Erwartete Tastatur.** Im Video kam die Tastatur nach „Neu → Rezept“ erst rund 1,2 s nach dem
   Tipp, als das Fenster schon unten stand. `openKeyboardNow()` meldet daher eine erwartete
   Tastatur: Bis sie kommt (höchstens 1,5 s, wie die Übergabe des Fokus) gilt die zuletzt gemessene
   Höhe, beim ersten Mal 45 % der Fensterhöhe (gemessen im Video: Oberkante der Leiste bei 55 %).
   Die Höhe wird je Fenstergröße im Speicher und in `localStorage` (`housekeeping.keyboard.v1`)
   gehalten; fehlt der Speicher, gilt die Schätzung. Nur in der Handy-Breite (iPad mit Tastatur
   zeigt keine Bildschirmtastatur).
5. **Erster Tipp auf ein Feld.** Ist noch kein Feld fokussiert, scrollt Safari beim Aufgehen der
   Tastatur selbst; die App setzt die Seite zurück und scrollt dann selbst (REQ-004). Das
   Abfangen von `touchend` mit verschobenem Feld (Base UI) würde Safaris Verschieben ganz
   verhindern, setzt aber den Cursor nicht mehr an die getippte Stelle — verworfen.
6. **Fenster schließen nimmt den Fokus mit.** Beim Schließen (sichtbar → nicht sichtbar) verliert
   ein Feld im Fenster sofort den Fokus, damit die Tastatur mit dem Fenster geht (REQ-003).
7. **Startbilder** (`apple-touch-startup-image`) sind auf iOS weiter der einzige Weg, den
   Startbildschirm einer Web-App zu färben (firt.dev „iOS PWA Compatibility“; `background_color`
   des Manifests nutzt iOS nicht). Einfarbig, je iPhone-Größe hochkant hell und dunkel, erzeugt von
   `apps/app/scripts/startup-images.mjs`. Ein kurzes Weiß zwischen Startbild und erstem Bild meldet
   WebKit-Bug 311569 (iOS 17 und 26, offen); das kann die App nicht verhindern.
8. Prüfbar ist die echte Tastatur nur am Gerät; die Tests simulieren `visualViewport` und den Fokus.
9. OFFEN: Warum die Tastatur im Video nach „Neu → Rezept“ erst spät kam (der versteckte Feld-Trick
   aus Spec 0033 sollte sie im Tipp öffnen), ist ohne iPhone nicht zu klären. Entscheidung 4 macht
   die Bewegung in beiden Fällen ruhig; Enrico prüft am iPhone, ob die Tastatur mit dem Tipp kommt.
10. Durchklick iPhone-Simulator (27.11., Review 0003, gemessen mit `scrollY`/`visualViewport`):
    - **˄ ˅ nur zu sichtbaren Feldern (I-02).** iOS legt beim Fokussieren fest, ob ˄ ˅ ein
      Nachbarfeld erreichen, und nimmt nur sichtbare (mit `--app-height` ist alles unter der
      Tastatur abgeschnitten); unser Scrollen zwei Bilder später kam zu spät (in „Beschreibung“
      war ˅ grau). Jetzt steht das Feld schon vor dem Fokus an seinem Platz: beim Wechsel mit
      ˄ ˅ im `blur`, beim Antippen im `focusin` (ohne Gleiten), und das nächste Feld schaut
      44 px herein, wenn beides in den sichtbaren Teil passt (`keyboardRevealScrollTop`, `next`).
      Liegt das nächste Feld weiter weg (Zeit → unter Gerichtart, Küche, Schlagworte), bleibt ˅
      grau — iOS.
    - **Getipptes Feld nimmt die Tastatur vorweg (I-10).** Ein Feld unten (Einkaufsmodus,
      „Was fehlt?“) ließ Safari die ganze Seite für einige Bilder um 330 pt hochschieben. Auf
      dem iPhone gilt beim Antippen eines Felds die erwartete Tastatur wie nach „Neu“
      (Entscheidung 4); verlässt der Cursor alle Felder vorher, endet die Erwartung.
    - **Fenster-Scrollen (I-14).** Safari scrollt bei offener Tastatur manchmal nur das Fenster
      (`scrollY` 331, sichtbarer Bereich unverändert, kein `resize`): das `scroll` des Fensters
      setzt es jetzt auch zurück.
    - **Meldung über dem Feld (I-09).** Bei offener Tastatur steht eine Meldung 12 über ihr, außer
      dort liegt das Feld mit dem Cursor: dann 8 darüber (`keyboardToastBottom`).
    - Gefunden, nicht geändert: I-04 (Fenster „Link“: „Bezeichnung“ im Safari-Tab unter der
      Leiste), I-05 (beim Schließen ~0,5 s leerer unterer Rand), I-06 (erster Tipp nach dem Tippen
      kam einmal nicht an) — siehe `tmp/review-0003/durchklick/iphone.md`.
    - Nachweis (27.11.): Tests rot, dann grün (`keyboard.test.tsx`, `keyboard-reveal.test.ts`,
      `toast-place.test.ts`, `overlay-handy.test.tsx`, `overlay.test.tsx`,
      `portrait-hint.test.ts`); `pnpm format:check && pnpm check && pnpm build:web` grün;
      iPhone-18-Pro-Simulator (iOS 27.2, Safari-Tab): Titel → Beschreibung → Portionen → Zeit mit
      ˅, `scrollY` bleibt 0 beim Antippen und in „Im Web suchen“.
11. iPhone-Durchklick Runde 2 (27.11., installierte PWA im Simulator):
    - **˅ im Fenster „Link“ (I-04).** Das Feld bekam den Cursor (aus dem versteckten Feld, Spec
      0033 Entscheidung 10) schon während das Fenster hineinglitt; iOS legt dann fest, welche
      Nachbarn ˄ ˅ erreichen, und nimmt nur sichtbare. Jetzt hält das versteckte Feld Tastatur und
      Fokus, bis das Fenster steht (`holdHandOver`, 250 ms), dann übernimmt das Feld. Außerdem
      meldet React Native Web mit offener Tastatur den sichtbaren Bereich als Fensterhöhe; ein
      kleines Fenster („s“ = halbe Höhe) schrumpfte auf die Hälfte davon und schnitt sein zweites
      Feld ab. Die Fenstergrößen gehen jetzt vom ganzen Bildschirm aus (`sheetWindowHeight`), die
      Tastatur begrenzt sie wie bisher.
    - **Tastatur blieb nach dem Schließen (I-05).** React Native Webs Modal gibt den Fokus beim
      Schließen an das zurück, was ihn beim Öffnen hatte — das versteckte Feld, das die Tastatur
      offen hielt. Es verlässt die Seite, sobald es übergeben hat. Der leere Rand beim Schließen
      aus Runde 1 trat in der installierten App nicht mehr auf.
    - **Gemerkte Tastaturhöhe (I-22).** Gemerkt wird je Fenstergröße die höchste gemessene
      Tastatur (mit Vorschlagsleiste), nicht die letzte: nach einer Adress-Tastatur (369 pt)
      rechnete das Antippen von „+ Posten hinzufügen“ mit zu wenig, und Safari schob die Seite
      ~90 ms um 158 pt hoch. Zu hoch geschätzt bleibt nur kurz eine Lücke. Gelesen wird der
      Speicher jedes Mal (nur ohne Speicher gilt der Wert im Arbeitsspeicher).
    - I-06 (erster Tipp auf einen Treffer kam nicht an) ließ sich nicht nachstellen.
    - Nachweis (27.11.): Tests rot, dann grün (`overlay-handy.test.tsx`, `keyboard-proxy.test.tsx`,
      `keyboard-state.test.ts`, `title-fit.test.ts`, core `add-entry.test.ts`); `pnpm format:check
&& pnpm check && pnpm build:web` grün; installierte PWA im iPhone-18-Pro-Simulator: ˅ in
      „Link“, Schließen ohne hängende Tastatur, `scrollY` 0 in „+ Posten hinzufügen“.
12. Nachklick 27.11., Ruckeln (ändert Spec 0033, REQ-006 für Bearbeiten-Fenster): Bearbeiten-
    Fenster über den Stift (Aktivität, Restaurant, Markt) öffnen ohne Cursor und ohne Tastatur. Die
    Tastatur kam mitten im Hereingleiten, das Fenster sprang hoch und zurück, beim Schließen ebenso.
    Den Cursor setzen nur Anlegen-Fenster und gezielte Aktionen („Notiz hinzufügen“, Umbenennen,
    Suchen).

- **Nachklick 27.11., B-01:** „Reisetasche umbenennen“, „Bereich umbenennen“ und die Namensfenster
  zum Anlegen (Reisetasche, Markt, Bereich) öffnen die Tastatur mit dem Tipp (`openKeyboardNow`), statt
  den Cursor erst nach dem Hereingleiten zu setzen; vorher rückte das Fenster für eine Tastatur hoch,
  die in Safari nicht kam, und fiel zurück.

## Daten

Entfällt: nur Oberfläche. Neu im Browser-Speicher: die zuletzt gemessene Tastaturhöhe je
Fenstergröße (keine personenbezogenen Daten).

## Umsetzung

- [x] 1. Reine Geometrie `keyboardRevealScrollTop` (AC-011–AC-015)
- [x] 2. Tastatur-Zustand: Verschiebung, sofort/nach Ruhe, erwartete Höhe (AC-003–AC-008, AC-010)
- [x] 3. `keyboard.web.ts`: Feld mit Cursor zeigen, Fokuswechsel ohne Safari-Scrollen
      (AC-016–AC-021); `openKeyboardNow` meldet die erwartete Tastatur (AC-004–AC-006)
- [x] 4. `Sheet`: gleitet mit der Tastatur, Fokus weg beim Schließen (AC-009)
- [x] 5. Startbilder und Verweise in `index.html` (AC-001)
- [x] 6. Playwright (WebKit, Chromium, 390 × 844) mit simulierter Tastatur: Bearbeiten-Modus,
      „Neu“-Fenster, Link-Fenster, Einkaufsliste scrollt; Bilder in `tmp/review-0003/0044/`
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün

Nachweis (26.11.): Tests rot, dann grün: `keyboard-reveal.test.ts` (AC-011–AC-015, AC-018),
`keyboard-state.test.ts` (AC-003–AC-005, AC-007, AC-008, AC-010), `keyboard.test.tsx` (AC-016–AC-021),
`overlay-handy.test.tsx` (AC-003–AC-006, AC-008–AC-010; Spec 0033 AC-008 angepasst, Entscheidung 2),
`apps/app/scripts/startup-images.test.mjs` (AC-001, 25 Tests). `pnpm format:check && pnpm check &&
pnpm build:web` grün (ui 97,6 % Zeilen). Dev-Server Port 8091, WebKit und Chromium 390 × 844 mit
iPhone-Kennung und simulierter Tastatur (380 px, `tmp/0044/kb.mjs`): „Neu → Rezept“ steht ab 100 ms
auf der Tastatur und bewegt sich nicht mehr, auch wenn die Tastatur erst nach rund 1 s kommt; im
Bearbeiten-Modus stehen „Titel“ und sechs weitere Felder (Beschreibung bis „Stunden vorher“)
nacheinander ganz über der Tastatur (oberes Drittel), die Seite bleibt bei `scrollY = 0`; Link-Fenster:
„Adresse“ und „Bezeichnung“ sichtbar, beim Abbrechen gleiten Fenster und Tastatur zusammen;
„Einkaufen“ scrollt (Leiste unten bei 844 px). Desktop 1440 × 900 unverändert. Bilder in
`tmp/review-0003/0044/`. Security-Check (security-auditor): 0 Befunde, 2 Hinweise; die gespeicherte
Höhe zählt nur, wenn sie kleiner als das Fenster ist. Offen: iPhone-Abnahme (AC-002, AC-022,
Entscheidung 9).
