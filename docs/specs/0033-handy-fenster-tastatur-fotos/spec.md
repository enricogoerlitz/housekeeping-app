---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
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
4. Kontakt-Ausfüllen: iOS ignoriert `autocomplete="off"`; gebaut wird mit passenden
   `autocomplete`-Werten (`off` + eindeutiger `name`, URL-Felder `type=url`/`inputmode=url`). OFFEN:
   ob iOS die Leiste damit vollständig weglässt, zeigt erst das Gerät; Ausweg wäre
   `autocomplete="one-time-code"`-artige Tricks, die ich nicht ohne Rückfrage einsetze.
5. Foto-Auswahl: Das unsichtbare `<input type=file>` hängt während der Auswahl am Dokument und wird
   erst nach `change`/`cancel` entfernt (Ursache H-11 laut Analyse).

## Daten

Entfällt: nur Oberfläche.

## Umsetzung

- [ ] 1. `Sheet`: Wegwischen mit Kopf und Inhalt-oben, Tests der reinen Entscheidungslogik in
      `packages/ui` (AC-001–AC-005)
- [ ] 2. Schleier auf dem Handy transparent, Schatten/Griff (AC-006, AC-007)
- [ ] 3. Tastatur-Rahmen: einmal setzen nach Ende der visualViewport-Änderung, Fenster unten
      verankern (AC-008–AC-010)
- [ ] 4. Seiten-Scroll-Sperre unter Fenstern, `scrollIntoView` nur bei Bedarf (AC-011–AC-013)
- [ ] 5. Eingabe-Attribute in `TextField` und den eigenen Eingabefeldern (AC-014–AC-016)
- [ ] 6. Fokus beim Öffnen (Fenster setzt Fokus nach der Einblend-Animation) (AC-017–AC-020)
- [ ] 7. Suche: X mit Fokus-Erhalt (AC-021, AC-022)
- [ ] 8. `pick-photo.ts`: Input im Dokument halten (AC-023, AC-024)
- [ ] 9. Toast-Abstand auf Rezept- und Sammlungsseite (AC-025)
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün; Bildschirmfotos
      `/ui-verify`; iPhone-Abnahme durch Enrico in der Vorschau
