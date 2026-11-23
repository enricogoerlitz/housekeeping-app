---
status: freigegeben
datum: 2026-11-23
---

# 0032 — Handy: Tastatur und Fenster

**Quelle:** Test des Inhabers in der Vorschau auf dem iPhone (PWA), 23.11.2026, mit Bildschirmfotos:
Beim Tippen hängen Tab-Leiste und Fußleisten mitten im Bild, Fenster werden so weit hochgeschoben,
dass kaum etwas zu sehen ist, „Speichern“ nimmt viel Platz weg, Titel-Felder bieten „Kontakt
autom. ausfüllen“ an. Entscheidung des Inhabers: Aktionen in die Kopfzeile wie bei iOS.
**Kritischer Pfad:** nein.

## Ziel

Wer auf dem Handy etwas eintippt, sieht das Feld, an dem er schreibt, den Rest des Fensters und
den Knopf zum Speichern, ohne zu scrollen oder zu suchen. Die Seite dahinter verrutscht nicht, und
nichts Unnötiges (Tab-Leiste, Fußleiste) nimmt über der Tastatur Platz weg. Auf dem Desktop bleibt
alles, wie es ist.

## Nicht-Ziele

- Keine native App; es bleibt die PWA (Safari, Chrome).
- Die Leiste von Safari über der Tastatur (˄ ˅ ✓) bleibt; eine Web-App kann sie nicht entfernen.
- Kleine Bestätigungsfenster ohne Eingabe („Entfernen?“, „Liste leeren?“) behalten ihre Knöpfe
  unten; dort tippt niemand.
- Kein neues Aussehen für den Desktop und das Tablet.

## Anforderungen

### Tastatur

**REQ-001 — Die Seite endet über der Tastatur.** Ist die Tastatur auf dem Handy offen, endet die
App an ihrer Oberkante: Die Tab-Leiste (und der Assistent-Knopf) ist ausgeblendet, eine
Eingabezeile unten (z. B. „Was fehlt?“ auf der Liste) sitzt direkt auf der Tastatur, und die Seite
verschiebt sich nicht. Quelle: Inhaber. Offline: offline vollständig.

- AC-001: Angenommen Handy mit offener Tastatur (sichtbarer Bereich 400 px von 844 px) · Dann
  endet die App bei 400 px, und es gibt keine Tab-Leiste
- AC-002: Angenommen dieselbe Seite · Wenn die Tastatur sich schließt · Dann ist die App wieder
  844 px hoch und die Tab-Leiste da
- AC-003 (Rand): Angenommen der sichtbare Bereich ist nur um 100 px kleiner (Leiste des Browsers,
  keine Tastatur) · Dann gilt das nicht als offene Tastatur, die Tab-Leiste bleibt

**REQ-002 — Fenster über der Tastatur.** Ein Fenster auf dem Handy sitzt bei offener Tastatur
direkt über ihr und füllt den sichtbaren Bereich bis knapp unter den oberen Rand; seine Kopfzeile
mit den Aktionen bleibt sichtbar, der Inhalt scrollt darunter. Ein Hinweis (Toast) steht über der
Tastatur. Quelle: Inhaber. Offline: offline vollständig.

- AC-004: Angenommen Handy, „Reise eintragen“ ist offen, die Tastatur offen (sichtbarer Bereich
  400 px) · Dann endet das Fenster bei 400 px, und seine Kopfzeile steht im sichtbaren Bereich
- AC-005: Angenommen dasselbe Fenster · Wenn die Tastatur sich schließt · Dann hat es wieder seine
  feste Größe (Spec 0005, REQ-003)

### Aktionen

**REQ-003 — Aktionen in der Kopfzeile auf dem Handy.** Fenster mit Eingaben zeigen auf dem Handy
ihre Aktionen in der Kopfzeile: links „Abbrechen“, in der Mitte der Titel (eine Zeile), rechts die
Hauptaktion („Speichern“, „Fertig“, „Übernehmen“ …) in der Akzentfarbe. Eine Fußleiste gibt es dort
nicht mehr; weitere Knöpfe (z. B. „Entfernen“) stehen am Ende des Inhalts. Auf breiteren
Bildschirmen bleiben die Knöpfe unten wie bisher. Quelle: Inhaber. Offline: offline lesend — die
Hauptaktion ist offline ausgegraut wie bisher und nennt den Grund.

- AC-006: Angenommen Handy, „Aufgabe bearbeiten“ ist offen · Dann steht oben links „Abbrechen“,
  in der Mitte „Aufgabe bearbeiten“, rechts „Speichern“, und unten gibt es keine Fußleiste
- AC-007: Angenommen dasselbe Fenster · Wenn ich „Abbrechen“ tippe · Dann passiert dasselbe wie
  bisher mit „Abbrechen“ unten bzw. ✕
- AC-008 (Fehler): Angenommen offline · Dann ist „Speichern“ oben ausgegraut und beschreibt
  „Offline – zum Bearbeiten brauchst du Netz“
- AC-009 (Rand): Angenommen Desktop · Dann stehen „Abbrechen“ und „Speichern“ wie bisher unten im
  Fenster, oben steht ✕

### Eingabefelder

**REQ-004 — Kein Autofill für Sachfelder.** Felder für Titel, Namen von Dingen, Mengen und Notizen
bieten kein Ausfüllen aus Kontakten oder Adressen an. Quelle: Inhaber. Offline: offline
vollständig.

- AC-010: Angenommen das Feld „Titel“ eines Rezepts · Dann trägt es `autocomplete="off"`

## Entscheidungen

1. **Tastatur erkennen über `visualViewport`.** iOS verkleinert beim Öffnen der Tastatur nur den
   sichtbaren Bereich, nicht das Layout. Offen gilt die Tastatur, wenn der sichtbare Bereich mehr
   als 150 px kleiner ist als das Fenster (AC-003). Dann wird die Höhe der App auf den sichtbaren
   Bereich gesetzt und ein Verschieben der Seite zurückgenommen.
2. **Android:** `interactive-widget=resizes-content` im Viewport-Tag; dort schrumpft das Layout
   selbst. Die Tab-Leiste bleibt dort sichtbar (kein Unterschied messbar); hingenommen.
3. **Welche Fenster umgestellt werden (REQ-003):** alle mit Eingabefeldern oder einer
   Hauptaktion zum Speichern bzw. Übernehmen. Bestätigungsfenster ohne Eingabe behalten ihre
   Knöpfe unten (Nicht-Ziel 3). Testkennungen der Knöpfe bleiben gleich.
4. **„Abbrechen“ statt ✕ auf dem Handy:** Gibt ein Fenster keine eigene Abbrechen-Aktion, schließt
   „Abbrechen“ wie ✕ (gleiche Testkennung `…-close`). Ändert Spec 0029, AC-006 und AC-007 (Fußleiste
   über der Home-Leiste) für die umgestellten Fenster.
5. Prüfen lässt sich die echte Tastatur nur auf dem Gerät; die Tests simulieren den sichtbaren
   Bereich. Der Inhaber prüft in der Vorschau.

## Daten

Keine. Nur Darstellung.

## Umsetzung

- [ ] 1. Tastatur-Zustand in `ui` (`keyboardState`, `useKeyboardInset`, Höhe der App, Seite
      zurück), Viewport-Tag (AC-001–AC-003)
- [ ] 2. Tab-Leiste und Assistent-Knopf bei offener Tastatur aus, Toast über der Tastatur (AC-001,
      AC-002)
- [ ] 3. `Sheet` über der Tastatur (AC-004, AC-005)
- [ ] 4. `Sheet`-Aktionen (`actions`): Kopfzeile auf dem Handy, unten auf breiten Bildschirmen
      (AC-006–AC-009)
- [ ] 5. Fenster mit Eingaben auf `actions` umstellen (AC-006)
- [ ] 6. `autocomplete="off"` für Sachfelder in `TextField` (AC-010)
- [ ] 7. e2e: Kopfzeile auf dem Handy, Fußleiste am Desktop; betroffene Rundgänge anpassen
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün, betroffene e2e-Dateien
      grün, Vorschau ausgeliefert; Sichtprüfung auf dem iPhone durch den Inhaber
