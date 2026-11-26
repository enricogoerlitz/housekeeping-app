---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0033 — Handy: Fenster, Tastatur und Fotos

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
H-05, H-06, H-11, H-13, H-14, F-01, F-03, N-1) und die Videos `tmp/videos/1.mp4`, `2.MP4`
(Befunde in `tmp/review-0003/video-befunde.md`). **Welle 1.** **Kritischer Pfad:** nein.

## Ziel

Auf dem iPhone fühlen sich Fenster an wie in einer nativen App: Man wischt sie nach unten weg, der
Hintergrund bleibt ruhig und ohne grauen Schleier, und beim Tippen springt nichts. Das erste Feld
ist sofort zum Schreiben bereit, iOS bietet keine Kontakte zum Ausfüllen an, und ein Foto aus der
Mediathek kommt beim ersten Versuch an.

## Nicht-Ziele

- Kein neues Foto-Fenster (Drag and Drop, Bildadresse, Kamera-Auswahl): Spec 0038. Hier wird nur
  der bestehende Weg zuverlässig.
- Keine Änderung am Desktop-Verhalten der Fenster außer dem Fokus (REQ-006).
- Keine nativen Apps; alles gilt für die installierte Web-App auf iPhone und Android.

## Schon erledigt

- Tastatur hebt Fenster an, Felder rutschen in den sichtbaren Bereich (Spec 0032, `keyboard.web.ts`).
- `autoComplete="off"` an `TextField` außer E-Mail (Spec 0032, AC-010) — reicht iOS nicht (REQ-005).

## Anforderungen

„Handy“ = installierte Web-App auf dem iPhone (Android gleich), Bedienung mit dem Finger.
„Fenster“ = von unten hochgeschobenes Blatt (`Sheet`).

### Fenster

**REQ-001 — Fenster nach unten wegwischen.** Jedes Fenster auf dem Handy lässt sich am Kopf oder,
wenn sein Inhalt ganz oben steht, am Inhalt nach unten wegziehen; es folgt dem Finger und schließt
ab einer Schwelle oder bei schnellem Wisch. Quelle: H-05. Offline: offline vollständig.

- AC-001: Angenommen auf dem Handy ist das Fenster der Aufgabe „Bad putzen“ offen · Wenn ich den Kopf
  des Fensters 40 % seiner Höhe nach unten ziehe und loslasse · Dann schließt das Fenster
- AC-002: Angenommen dasselbe Fenster · Wenn ich 40 % nach unten ziehe, ohne loszulassen wieder
  ganz nach oben ziehe und loslasse · Dann bleibt das Fenster offen und federt in seine Lage zurück
- AC-003: Angenommen der Inhalt des Fensters „Artikel bearbeiten“ ist nach unten gescrollt · Wenn
  ich im Inhalt nach unten wische · Dann scrollt der Inhalt nach oben, und das Fenster bleibt offen;
  erst ein weiterer Wisch nach unten bei Inhalt ganz oben zieht das Fenster
- AC-004: Angenommen das Fenster „Neue Zutat“ hat ungespeicherte Eingaben · Wenn ich es
  wegwische · Dann verhält es sich wie „Abbrechen“ (gleiche Nachfrage wie heute, falls es eine gibt)
- AC-005: Angenommen ein Fenster ist offen · Wenn ich nur 10 % langsam nach unten ziehe und
  loslasse · Dann bleibt es offen

**REQ-002 — Kein grauer Schleier auf dem Handy.** Hinter Fenstern wird die Seite auf dem Handy nicht
abgedunkelt; Tippen neben das Fenster schließt es weiterhin. Am Desktop und Tablet bleibt der
Schleier. Quelle: H-06. Offline: offline vollständig.

- AC-006: Angenommen auf dem Handy · Wenn ich „Link“ im Rezept „Apfelkuchen“ öffne · Dann ist die
  Seite hinter dem Fenster unverändert hell (keine Abdunklung) · Und Tippen auf die Seite oberhalb
  des Fensters schließt es
- AC-007: Angenommen Desktop ab 1100 px · Wenn ich dasselbe Fenster öffne · Dann ist der Schleier
  wie bisher da

**REQ-003 — Fenster mit Tastatur bleibt ruhig.** Öffnet sich mit dem Fenster die Tastatur, steht das
Fenster nach dem Aufgehen der Tastatur in einem Schritt an seiner endgültigen Stelle, das aktive Feld
ist ganz sichtbar, und beim Schließen der Tastatur rutscht das Fenster nicht in die Bildschirmmitte.
Quelle: H-13. Offline: offline vollständig.

- AC-008: Angenommen auf dem Handy, Rezept „Apfelkuchen“ · Wenn ich „+ Link“ tippe · Dann ist das
  Feld „Adresse“ vollständig über der Tastatur zu sehen, und das Fenster ändert danach seine Lage
  nicht mehr, bis ich etwas tue
- AC-009: Angenommen das Fenster „Link“ ist mit Tastatur offen · Wenn ich die Tastatur mit „Fertig“
  schließe · Dann steht das Fenster unten am Bildschirmrand (nicht in der Mitte)
- AC-010: Angenommen „Artikel bearbeiten“ für „Ahornsirup“ ist offen · Wenn ich in „Name“ tippe ·
  Dann bleibt der Kopf des Fensters mit „Abbrechen / Fertig“ sichtbar

**REQ-004 — Seite hinter dem Fenster bewegt sich nicht.** Öffnen, Schließen und Tippen in einem
Fenster scrollen die Seite dahinter nicht; beim Wechsel in den Bearbeiten-Modus eines Abschnitts
scrollt die Seite höchstens einmal, und nur wenn der Abschnitt sonst nicht sichtbar wäre.
Quelle: H-14. Offline: offline vollständig.

- AC-011: Angenommen die Seite „Apfelkuchen“ ist bis „Zutaten“ gescrollt · Wenn ich „Neue Zutat“
  öffne, „Blumen“ übernehme und das Fenster schließt · Dann steht die Seite an derselben Stelle wie
  vor dem Öffnen
- AC-012: Angenommen „Zutaten“ ist vollständig sichtbar · Wenn ich in den Bearbeiten-Modus wechsle ·
  Dann scrollt die Seite nicht
- AC-013: Angenommen ein Fenster ist offen · Wenn ich auf dem Schleier-Bereich der Seite wische ·
  Dann scrollt die Seite dahinter nicht

### Eingabe

**REQ-005 — Kein Kontakt-Ausfüllen, passende Tastatur.** Textfelder, die keine Kontaktdaten sind,
lösen auf iOS keinen Vorschlag „Kontakt autom. ausfüllen“ aus; Felder für Webadressen öffnen die
URL-Tastatur. Quelle: Video-Befund N-1. Offline: offline vollständig.

- AC-014: Angenommen auf dem iPhone · Wenn ich in „Titel“ (Neues Rezept), „Adresse“ (Link) oder
  „Name“ (Artikel bearbeiten) tippe · Dann erscheint über der Tastatur keine Leiste „Kontakt autom.
  ausfüllen“ und kein Kontaktname
- AC-015: Angenommen das Fenster „Link“ · Wenn ich in „Adresse“ tippe · Dann zeigt die Tastatur
  „/“ und „.de“ (URL-Tastatur)
- AC-016: Angenommen ein Formular mit E-Mail (Einladung) · Wenn ich in „E-Mail“ tippe · Dann
  schlägt iOS weiter E-Mail-Adressen vor

**REQ-006 — Erstes Feld bereit.** Öffnet sich ein Fenster zum Anlegen oder Bearbeiten, steht der
Cursor im ersten Textfeld, auf dem Handy mit offener Tastatur. Fenster, die nur anzeigen (Aufgabe,
Eintrag), fokussieren nichts. Quelle: F-01. Offline: offline vollständig.

- AC-017: Angenommen Desktop · Wenn ich „Neu“ → „Rezept“ wähle · Dann kann ich sofort den Titel
  tippen, ohne zu klicken
- AC-018: Angenommen Handy · Wenn ich „Neu“ → „Rezept“ wähle · Dann ist die Tastatur offen und der
  Cursor im Titel
- AC-019: Angenommen Desktop · Wenn ich „Neues Restaurant“, „Neue Aktivität“, „Neue Aufgabe“,
  „Neuer Artikel“, „Neue Zutat“ oder „Link“ öffne · Dann steht der Cursor im ersten Textfeld
- AC-020: Angenommen Handy · Wenn ich das Fenster der Aufgabe „Bad putzen“ öffne · Dann geht keine
  Tastatur auf

**REQ-007 — Suche leeren behält den Fokus.** Das X im Suchfeld leert es; stand der Cursor im Feld,
bleibt er dort und die Tastatur offen; sonst springt er nicht hinein. Quelle: F-03. Offline: offline
vollständig.

- AC-021: Angenommen Handy, Rezeptsuche „Nudeln“, Cursor im Feld · Wenn ich auf X tippe · Dann ist
  das Feld leer, der Cursor steht darin, die Tastatur bleibt offen
- AC-022: Angenommen Handy, Rezeptsuche „Nudeln“, Tastatur geschlossen · Wenn ich auf X tippe · Dann
  ist das Feld leer und die Tastatur bleibt zu

### Fotos und Hinweise

**REQ-008 — Foto aus der Mediathek kommt an.** Wähle ich auf dem iPhone ein Foto aus der Mediathek
und bestätige, wird es beim ersten Versuch gespeichert. Quelle: H-11. Offline: nur online (Hinweis
wie heute).

- AC-023: Angenommen iPhone, Rezept „DemoRezept“ ohne Foto · Wenn ich „Foto ändern“ →
  „Fotomediathek“ wähle, ein Foto antippe und bestätige · Dann erscheint „Foto wird gespeichert …“
  und danach das Foto
- AC-024: Angenommen derselbe Ablauf · Wenn ich in der Mediathek „Abbrechen“ tippe · Dann bleibt
  das Rezept ohne Foto und es erscheint keine Fehlermeldung

**REQ-009 — Hinweise verdecken keine Knöpfe.** Kurze Hinweise („Foto gespeichert“) stehen über den
Knöpfen am unteren Rand der Seite, nicht darauf. Quelle: Video-Befund. Offline: offline vollständig.

- AC-025: Angenommen Handy, Rezept „DemoRezept“ · Wenn „Foto gespeichert“ erscheint · Dann
  überdeckt der Hinweis weder „Einplanen“ noch „Auf die Liste“

## Entscheidungen

1. Wegwischen nach dem Muster der `gestures`-Skill-Regeln: 1:1 mit dem Finger, Schließen ab 30 %
   der Fensterhöhe oder Geschwindigkeit > 0,5 px/ms, sonst Zurückfedern; Gummiband nach oben.
2. Ohne Schleier braucht das Fenster auf dem Handy einen sichtbaren Rand: Schatten nach oben und der
   Griff oben (DESIGN.md-Token), damit es sich von der Seite abhebt.
3. Seiten-Scroll unter offenen Fenstern wird gesperrt (Scroll-Container der Seite), statt die
   Ursachen einzeln zu flicken; `scrollIntoView` beim Bearbeiten nur, wenn der Abschnitt außerhalb
   des sichtbaren Bereichs liegt.
4. Kontakt-Ausfüllen (überarbeitet nach Enricos Test am 26.11.: „Restaurant bearbeiten“ → „Name“
   bot weiter „Kontakt autom. ausfüllen“): Safari ignoriert `autocomplete="off"` (so steht es in
   Apples Entwicklerdoku „Improving AutoFill experiences for your forms“) und rät aus `name`, `id`,
   Beschriftung und Platzhalter. Jedes Textfeld der App ist ein `TextField` (Wächtertest
   `text-inputs.test.ts`), und dort gilt jetzt (`field-autofill.ts`):
   (a) `name` und `id` sind neutral, nur Buchstaben und Ziffern (`hksearch12`): kein Bindestrich
   (Safari liest ihn als Telefonfeld), kein Kontaktwort, dafür „search“ (Suchfelder füllt Safari
   nicht aus Kontakten); (b) `autocomplete="off"` bleibt; (c) nur auf iPhone und iPad steht in
   Beschriftung, Platzhalter und zugänglichem Namen nach dem ersten Buchstaben jedes Kontaktworts
   („Name“, „Titel“, „Adresse“, „Straße“, „Telefon“, „E-Mail“, „Ort“ …) ein unsichtbarer
   Wortverbinder (U+2060): Text und Vorlesen bleiben gleich, Safaris Wortsuche findet nichts.
   E-Mail-Felder (Einladung) sind ausgenommen und behalten `autocomplete="email"`.
   Verworfen: `type="search"` für alle einzeiligen Felder (Return-Taste „Suchen“, eigenes ✕ von
   WebKit, andere Darstellung) und `autocomplete="one-time-code"` (iOS bietet dann SMS-Codes an).
   Ob die Leiste damit überall wegbleibt, zeigt nur das iPhone; Apple dokumentiert die Heuristik
   nicht. Nächster Schritt, falls nicht: `type="search"` mit `enterkeyhint="done"` nur für die
   Felder, in denen sie noch erscheint.
5. Foto-Auswahl: Das unsichtbare `<input type=file>` hängt während der Auswahl am Dokument und wird
   erst nach `change`/`cancel` entfernt (Ursache H-11 laut Analyse).
6. Beim Bau entschieden: Das Wegwischen hört auf die Touch-Ereignisse des Browsers
   (`sheet-drag-events.web.ts`), nicht auf den Responder von React Native: Nur ein Listener am
   Element selbst kann iOS das eigene Scrollen und Nachfedern beim ersten Zug verbieten (AC-003).
   Die Entscheidung selbst (`sheet-drag.ts`) ist rein und getestet. Elemente mit eigener Geste
   (`touch-action: none`, z. B. der Griff einer Ordnen-Liste) behalten den Finger. Nativ gibt es
   kein Wegwischen (nur PWA).
7. Die Seiten-Sperre hält jeden Scroll-Bereich in `#root` an seiner Stelle, solange ein Fenster da
   ist (auch beim Zurückgeben des Fokus an die Seite), statt `shell.tsx` zu ändern; nur auf dem
   Handy (Nicht-Ziel: Desktop unverändert).
8. Fokus: Ein `TextField` mit `autoFocus` im Fenster meldet sich beim Fenster an; das Fenster setzt
   den Fokus nach dem Einblenden (250 ms) ohne Scrollen und holt ihn 600 ms lang zurück, wenn ein
   sich schließendes Menü ihn auf seinen Knopf zurücklegt (das war die Ursache am Desktop: der Fokus
   landete auf dem Schleier). Ein eigenes Suchfeld mit `autoFocus` (z. B. „Neue Zutat“) wird
   genauso gehalten.
9. Hinweise: Seiten melden Knöpfe mit `useToastAvoid`; der Hinweis misst sie beim Erscheinen und
   ein Bild später noch einmal und steht dann über ihnen, nie höher als die Bildschirmmitte.
10. AC-018 (entschieden nach Enricos Test am 26.11.: auf dem iPhone war nie ein Feld bereit):
    Option B gebaut. iOS öffnet die Tastatur nur für ein `focus()` im Fingertipp selbst; das
    Fenster erscheint später (nach dem Menü, nach dem Adresswechsel). `openKeyboardNow()`
    (`packages/ui/src/keyboard-proxy.web.ts`) fokussiert im Tipp ein verstecktes, im Dokument
    stehendes Textfeld (16 px, unsichtbar, nicht `display: none`) – die Tastatur geht auf; sobald
    das Fenster sein Feld mit `autoFocus` anmeldet, übernimmt dieses den Fokus sofort (vor
    react-native-webs Fokusfalle des Fensters), und der Wechsel zwischen zwei Textfeldern lässt
    die Tastatur offen. Bis dahin, höchstens 1,5 s, bekommt nur ein Textfeld den Fokus: sonst
    legten das Menü (Fokus zurück auf „Neu“) und die Modals von react-native-web (Fokus in sich
    hinein, beim Schließen zurück) ihn auf einen Knopf, und die Tastatur ginge wieder zu. Kommt
    kein Fenster, gibt das Feld den Fokus nach 1,5 s ab. Nur auf iPhone und iPad. Benutzt von
    „Neu“ → Rezept/Sammlung/Restaurant (Menü und leere Liste), „Aktivität anlegen“, „Neue
    Aufgabe“, „Neuer Artikel“, „+ Zutat“ (Lese- und Bearbeiten-Modus), „+ Link“ und Link
    „Bearbeiten“, Restaurant- und Aktivität-„Bearbeiten“. Dabei: „Bearbeiten“ eines Restaurants
    setzt den Cursor in „Name“, eine Aktivität ebenso (vorher kein Feld). Fenster, die nur
    anzeigen (Aufgabe, Eintrag), rufen es nicht auf. Im Browser (WebKit mit iPhone-Kennung)
    geprüft: der Fokus geht Tipp → verstecktes Feld → „Titel“ und bleibt dort; ob die Tastatur
    aufgeht, zeigt nur das iPhone.
11. QA-Nachtrag (26.11.): Ohne Schleier wirkte ein Formular-Fenster (`m`) mit wenig Inhalt auf dem
    Handy kaputt (Aufgabe „Bad putzen“: 760 px hoch, die untere Hälfte leer). Auf dem Handy wächst
    `m` jetzt mit dem Inhalt bis 90 % und scrollt darüber; `l` (Suchen und Wählen mit Tabs) bleibt
    fest 90 % (Spec 0005, AC-014). Mit offener Tastatur steht das Fenster weiter auf ihr, höchstens
    bis knapp unter den oberen Rand (Spec 0032, AC-004). Wegwischen, Tastatur und Scrollen bleiben
    gleich. Ändert Spec 0005 AC-014 für `m` auf dem Handy.
12. QA-Nachtrag (26.11.): Über „Kochen“/„Einplanen“ landete „Foto gespeichert“ auf den Sternen
    „Du/Nadja“. Regel jetzt: Der Hinweis steht unten (über den gemeldeten Knöpfen der Seite, wie
    bisher); läge er dort auf etwas Bedienbarem (Knopf, Link, Feld), steht er oben unter der
    Statusleiste, falls dort frei; sonst bleibt er unten. Gemessen wird im Web beim Erscheinen und
    ein Bild später (`toastEdge`, `toast-place.ts`).

## Daten

Entfällt: nur Oberfläche.

## Umsetzung

- [x] 1. `Sheet`: Wegwischen mit Kopf und Inhalt-oben, Tests der reinen Entscheidungslogik in
      `packages/ui` (AC-001–AC-005)
- [x] 2. Schleier auf dem Handy transparent, Schatten/Griff (AC-006, AC-007)
- [x] 3. Tastatur-Rahmen: einmal setzen nach Ende der visualViewport-Änderung, Fenster unten
      verankern (AC-008–AC-010)
- [x] 4. Seiten-Scroll-Sperre unter Fenstern, `scrollIntoView` nur bei Bedarf (AC-011–AC-013)
- [x] 5. Eingabe-Attribute in `TextField` (AC-014–AC-016); das Suchfeld (`search-or-create.tsx`)
      gehört Spec 0036
- [x] 6. Fokus beim Öffnen (Fenster setzt Fokus nach der Einblend-Animation) (AC-017–AC-020)
- [x] 7. Suche: X mit Fokus-Erhalt (AC-021, AC-022) — gebaut mit Spec 0036: `FieldClearButton`
      (`packages/ui/src/field-clear.tsx`) in `SearchOrCreate` und den Suchen von Rezepten,
      Restaurants, Aktivitäten und Artikeln; ui-Tests AC-021/AC-022, Dev-Server geprüft
- [x] 8. `pick-photo.ts`: Input im Dokument halten (AC-023, AC-024), als `pickImageFile` in `ui`
- [x] 9. Toast-Abstand auf Rezept- und Sammlungsseite (AC-025)
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün; Bildschirmfotos
      `/ui-verify`; iPhone-Abnahme durch Enrico in der Vorschau
      _Stand 26.11.2026:_ `pnpm format:check`, `pnpm check` (ui 98,7 % Zeilen) und `pnpm build:web`
      (mit `.env`) grün. Tests: `sheet-drag.test.ts`, `keyboard-settle.test.ts`,
      `scroll-reveal.test.ts`, `toast-place.test.ts`, `field-autofill.test.ts`,
      `overlay-handy.test.tsx`, `page-scroll-lock.test.tsx`, `pick-image.test.tsx`, ergänzt
      `controls.test.tsx`, `editable-section.test.tsx`. Im Browser (Chromium, Touch emuliert, 390 ×
      844 und 1440 × 900): Link-Fenster ohne Schleier mit Griff, kurzer Zug federt zurück, langer Zug
      schließt, Seite bleibt stehen; „Neu → Rezept“ am Desktop mit Cursor im Titel; „Bad putzen“
      fokussiert nichts; Foto über den Dateiwähler beim ersten Mal gespeichert, „Foto gespeichert“
      über „Kochen / Einplanen / Auf die Liste“. Bilder in `tmp/review-0003/0033/`. Offen:
      iPhone-Abnahme (Wischen, Tastatur, Kontakt-Leiste, Mediathek).

Nachtrag nach Enricos Test der Welle 1 (26.11.): Entscheidungen 4 und 10 neu. Tests rot, dann
grün: `field-autofill.test.ts` (neutrale Namen, Wortverbinder, iPhone-Erkennung),
`controls.test.tsx` (Attribute am `TextField`, iPhone und sonst), `text-inputs.test.ts` (nur
`TextField` hat Textfelder), `keyboard-proxy.test.tsx` (AC-017, AC-018, AC-020). Dev-Server
(Port 8095), WebKit mit iPhone-Kennung 390 × 844: „Neu → Rezept“, „Neu → Restaurant“, „Neuer
Artikel“, „Neue Aufgabe“ – Fokus wandert ohne Umweg über einen Knopf ins erste Feld. Offen:
iPhone-Abnahme (Tastatur geht auf, keine Kontakt-Leiste). `/security-check` (security-auditor) auf dem Diff
aller Nachträge: 0 Befunde, 2 Hinweise ohne Angriffspfad (Fokus-Ersatz gilt seitenweit für 1,5 s;
verstecktes Feld ist `aria-hidden`, aber fokussierbar).

QA-Nachtrag 26.11.: Entscheidungen 11 und 12. `sheet-size.test.ts`, `overlay.test.tsx`,
`overlay-handy.test.tsx` (Toast oben statt auf den Sternen) und `toast-place.test.ts` (`toastEdge`,
rot gezeigt, dann grün); `photo-viewer.test.tsx` (dunkle Bühne auch hell, rot gezeigt). Dev-Server
390 × 844: Aufgabe „Bad putzen“ 380 statt 760 px hoch, Wegziehen schließt; lange Formulare (Eintrag,
Neue Zutat, Restaurant, Artikel) bis 760 px und scrollen; „Foto gespeichert“ oben neben „‹ Essen“.
Bilder in `tmp/review-0003/qa-fix/`.
