---
status: umgesetzt
datum: 2026-11-27
---

# 0057 — Übersicht und Feinschliff der Navigation

**Quelle:** UI/UX-Review vom 27.11.2026 (`tmp/feature-review/04-ui-ux.md`), Befunde #1, #9 und #10,
von Enrico als „Paket 1, passt 100 %“ freigegeben. **Kritischer Pfad:** nein (keine Daten, kein
Sync; „Wie war's?“ bewertet über die bestehenden Befehle).

## Ziel

Die Übersicht zeigt zuerst, was heute zu tun ist: „Zu tun“ und „Einkauf“ stehen oben, „Wie war's?“
ist eine kleine Karte darunter, die man trotzdem mit einem Tipp bedient. Die Tab-Leiste verhält
sich wie auf dem iPhone gewohnt: ein zweiter Tipp auf den aktiven Tab bringt nach oben bzw. zur
Startseite, und die Hervorhebung bleibt beim Bereich, aus dem man kam, solange „Zurück“ dorthin
führt. Titel in schmalen Karten werden nicht mehr mitten im Wort getrennt.

## Nicht-Ziele

- Keine neue Navigation: Tabs, ⊞ Verwalten und Seitenleiste bleiben, wie sie sind.
- Kopfzeilen, ⋯-Menüs und Anlegen-Knöpfe (Spec 0054, auch die Kopfzeile der Übersicht), KI-Fenster
  (0055), Rezeptseite und Kochmodus (0056), Themes (0058).
- „Passt so“ als stille Voreinstellung, die nach einigen Tagen selbst greift (Review-Idee): ändert
  Bewertungsdaten, eigener Wunsch.
- Kalender-Woche am Desktop (Review #7) außer dem, was die geänderte Titel-Regel dort mitbringt.

## Anforderungen

### Übersicht

**REQ-001 — „Wie war's?“ als kompakte Karte unter „Zu tun“ und „Einkauf“.** Die offenen Einträge
stehen als Stapel in einer Karte: ein Eintrag mit Bild, Name, Art, Tag, Sternen, „Passt so“ und
„Nicht gemacht“; darüber „1 von 5“ mit ‹ › zum Blättern. Nach dem Bewerten verlässt der Eintrag
den Stapel wie heute nach 2 s, der nächste rückt an dieselbe Stelle. Die Karte steht am Handy und
Tablet nach „Zu tun“, „Einkauf“ und „Reisetasche“, am Desktop in der rechten Spalte nach ihnen.
Quelle: #1. Offline: offline lesend (Bewerten und „Nicht gemacht“ brauchen Netz, wie bisher).

- AC-001: Angenommen Handy 390 × 844, fünf offene Einträge · Wenn ich die Übersicht öffne · Dann
  steht „Wie war's?“ unter „Zu tun“ und „Einkauf“ und zeigt genau einen Eintrag mit „1 von 5“
- AC-002: Angenommen Desktop 1440 × 900, fünf offene Einträge · Dann steht in der rechten Spalte
  „Zu tun“ über „Wie war's?“, und die Karte ist höchstens 220 px hoch
- AC-003: Angenommen der Stapel zeigt „Lasagne“ (1 von 5) · Wenn ich 4 Sterne antippe · Dann ist
  nach einem Tipp bewertet, und nach 2 s zeigt die Karte den nächsten Eintrag mit „1 von 4“
- AC-004: Angenommen „1 von 3“ · Wenn ich › tippe · Dann zeigt die Karte den zweiten Eintrag mit
  „2 von 3“; › am letzten führt zum ersten
- AC-005: Angenommen ich stehe auf dem zweiten Eintrag und der erste verlässt den Stapel (nach
  seinem Bewertungsfenster oder von einem anderen Gerät) · Dann bleibt der gezeigte Eintrag stehen
- AC-006: Angenommen ich wähle „Nicht gemacht“ · Wenn ich im Hinweis „Rückgängig“ tippe · Dann
  zeigt die Karte diesen Eintrag wieder
- AC-007: Angenommen nur ein offener Eintrag · Dann zeigt die Karte weder „1 von 1“ noch ‹ ›;
  ohne offene Einträge fehlt die Karte ganz
- AC-008: Angenommen offline · Dann sind Sterne, „Passt so“ und „Nicht gemacht“ mit dem
  Offline-Hinweis deaktiviert, ‹ › blättern weiter

### Tab-Leiste und Seitenleiste

**REQ-002 — Erneuter Tipp auf den aktiven Tab.** Ein Tipp auf den hervorgehobenen Tab (Handy) bzw.
Bereich der Seitenleiste (Tablet, Desktop) scrollt dessen Startseite nach oben, wenn man auf ihr
steht (ohne Fenster und Detail); sonst führt er zur Startseite des Bereichs, wie sie zuletzt war.
Quelle: #9. Offline: offline vollständig.

- AC-009: Angenommen Handy, Essen, Rezepte nach unten gescrollt · Wenn ich „Essen“ tippe · Dann
  steht die Rezeptliste oben
- AC-010: Angenommen Desktop, Übersicht nach unten gescrollt · Wenn ich „Übersicht“ in der
  Seitenleiste wähle · Dann steht die Übersicht oben
- AC-011: Angenommen Handy, ein Rezept aus der Rezeptliste geöffnet · Wenn ich „Essen“ tippe ·
  Dann sehe ich die Rezeptliste (Suche und Filter wie zuletzt), nicht oben gescrollt
- AC-012: Angenommen Liste mit offenem Posten-Fenster · Wenn ich „Liste“ tippe · Dann ist das
  Fenster zu und die Liste bleibt, wo sie war
- AC-013: Angenommen reduzierte Bewegung · Wenn ich den aktiven Tab erneut tippe · Dann springt die
  Seite ohne Animation nach oben

**REQ-003 — Hervorhebung bleibt beim Herkunftsbereich.** Eine Seite, die mit `von` aus einem
anderen Bereich geöffnet wurde, hebt in Tab-Leiste und Seitenleiste diesen Bereich hervor, solange
ihr „Zurück“ dorthin führt; genau ein Eintrag ist markiert. Ohne `von` (Deep Link, Seitenleiste)
gilt der eigene Bereich. Die Startseiten der fünf Tabs heben immer sich selbst hervor. Quelle: #9.
Offline: offline vollständig.

- AC-014: Angenommen Handy, Übersicht · Wenn ich „Heute geplant: Kichererbsen-Eintopf“ öffne ·
  Dann ist „Übersicht“ hervorgehoben, nicht „Essen“, und oben steht „‹ Übersicht“
- AC-015: Angenommen ein Rezept aus der Übersicht · Wenn ich daraus den Kochmodus öffne (Desktop) ·
  Dann bleibt „Übersicht“ hervorgehoben
- AC-016: Angenommen ein Rezept aus der Übersicht · Wenn ich darin ein verknüpftes Rezept öffne ·
  Dann bleibt „Übersicht“ hervorgehoben, und „Zurück“ führt erst zum ersten Rezept
- AC-017: Angenommen Desktop, Kalender · Wenn ich bei „Bouldern“ „Öffnen“ wähle · Dann ist in der
  Seitenleiste nur „Kalender“ markiert (nicht zusätzlich „Aktivitäten“), und „‹ Kalender“ führt
  zurück
- AC-018: Angenommen Desktop, ⊞ Verwalten → Aktivitäten → „Bouldern“ · Dann ist nur „Aktivitäten“
  markiert, kein Tab
- AC-019: Angenommen der Link `/rezept/<id>` ohne `von` wird direkt geöffnet · Dann ist „Essen“
  hervorgehoben; mit einem unbekannten `von` ebenso
- AC-020: Angenommen ein Rezept aus der Übersicht · Wenn ich „Übersicht“ tippe · Dann sehe ich die
  Übersicht (REQ-002, nicht nach oben gescrollt), wenn ich „Essen“ tippe, die Rezeptliste

### Titel

**REQ-004 — Titel ohne Silbentrennung.** Titel (Karten-, Zeilen- und Kalendertitel) brechen nur
zwischen Wörtern und an echten Bindestrichen, nie mit automatischer Silbentrennung. In schmalen
Karten (Übersicht „Heute geplant“, Rezepte-Raster, Tageskacheln) steht ein Titel in höchstens zwei
Zeilen; passt ein einzelnes Wort nicht in die Breite, wird der Titel einzeilig mit „…“ gekürzt.
Quelle: #10. Offline: offline vollständig.

- AC-021: Angenommen Handy 390 px, Rezepte-Raster · Dann steht „Halloumi-|Pfanne“ und
  „Spaghetti|Bolognese“, nie „Pfan-|ne“ oder „Bolo-|gnese“
- AC-022: Angenommen Desktop 1440 px, Tageskachel „Kichererbsen-Eintopf“ · Dann steht dort kein
  „Kichererb-|sen“; passt „Kichererbsen-“ nicht in die Zeile, steht „Kichererbsen-Ein…“ in einer
  Zeile
- AC-023: Angenommen ein Titel aus einem Wort, länger als die Karte breit ist · Dann endet er mit
  „…“ in einer Zeile und ragt nicht aus der Karte
- AC-024: Angenommen Desktop 1440 px, Kalender-Woche mit „Kichererbsen-Eintopf“ und „Bettwäsche
  wechseln“ · Dann steht „Kichererbsen-|Eintopf“ und „Bettwäsche|wechseln“ (Spec 0031, AC-078 gilt
  weiter)

**REQ-005 — Datumstitel einzeilig.** Der Titel der Übersicht steht in einer Zeile: ab Tablet
„Freitag, 27. November“, am Handy die kurze Form „Fr., 27. Nov.“ (Mai, Juni, Juli, März
ungekürzt; in einem anderen Jahr mit Jahreszahl). Quelle: #10. Offline: offline vollständig.

- AC-025: Angenommen Handy 360 × 780 und 390 × 844, Freitag, 27. November · Dann steht
  „Fr., 27. Nov.“ in einer Zeile neben den Knöpfen
- AC-026: Angenommen Desktop 1440 px · Dann steht „Freitag, 27. November“
- AC-027: Angenommen Handy, gezeigter Tag 8. Januar 2027 (heute 2026) · Dann steht
  „Fr., 8. Jan. 2027“; am 15. Mai „…, 15. Mai“

## Entscheidungen

1. **REQ-001, Stapel statt Liste:** Eine Zeile je Eintrag mit kleinen Sternen hätte die
   halben Sterne unter die Trefferfläche von Spec 0011, AC-017 gedrückt und wächst weiter mit jedem
   Eintrag; ein Fenster mit allen Einträgen kostet bei jedem Bewerten einen Tipp mehr. Der Stapel
   hat eine feste Höhe (ein Eintrag, ~150 pt statt ~700 pt), Sterne in voller Größe und bleibt bei
   einem Tipp je Bewertung. Kein Wischen im Stapel: am Handy wechselt ein Wischen über die
   Übersicht schon den Tag (Spec 0034, REQ-005).
2. **REQ-001, Platz:** nach „Reisetasche“ statt direkt nach „Einkauf“: Packen ist wie Abhaken ein
   Handgriff für heute, Bewerten ist Nachpflege. Ändert Spec 0011, REQ-003 (Reihenfolge) und die
   Spalten-Aufteilung von Spec 0012 (rechte Spalte: Zu tun, Einkauf, Reisetasche, Wie war's?).
3. **REQ-001, welcher Eintrag steht:** die Karte merkt sich den gezeigten Eintrag; verlässt er den
   Stapel, rückt der an seine Stelle, der dort jetzt steht (am Ende: der letzte). Reine Regel in
   `core` (`recapStackIndex`), damit ein fremdes Bewerten den Eintrag unter dem Finger nicht
   austauscht.
4. **REQ-002:** Ein Tipp gilt als „erneut“, wenn der Bereich hervorgehoben ist (REQ-003), nicht
   wenn der Router ihn fokussiert hat; so führt „Übersicht“ auf einem Rezept aus der Übersicht
   zurück zur Übersicht. „Auf der Startseite“ heißt: die aktuelle Adresse ist die Startseite des
   Bereichs, wie sie zuletzt war (`sectionHref`); sonst wird sie geöffnet, wie bisher. Das Nach-oben
   bekommt die sichtbare Seite über eine Anmeldung in `packages/ui` (`Screen`, `InfiniteList`); so
   muss keine Seite einzeln umgebaut werden.
5. **REQ-003:** Die Hervorhebung folgt `von` (auch `verwalten`, `reisen`) auf jeder Seite außer den
   fünf Tab-Startseiten. Ändert Spec 0035, REQ-002 mit AC-005 bis AC-007 (Markierung nach der Seite)
   und deren Entscheidung 1: Eine Seite, die aus einer Seite mit `von` geöffnet wird, erbt deren
   Bereich und nennt ihn („‹ Übersicht“ auch beim zweiten Rezept); „Zurück“ geht weiter Schritt für
   Schritt. Der K-04-Wunsch von Spec 0035 („nur ein Eintrag markiert“) bleibt: ein Verwalten-Eintrag
   der Seitenleiste ist nur markiert, wenn kein Tab hervorgehoben ist.
6. **REQ-003, Kochmodus:** bekommt `von` vom Rezept mit, damit die Seitenleiste am Desktop nicht auf
   „Essen“ springt. Am Handy verdeckt der Kochmodus die Tab-Leiste ohnehin.
7. **REQ-004:** `hyphens: manual` statt `auto` für die Titel-Rollen und `KindLine`. Ändert Spec
   0031, REQ-033 (automatische Trennung); dessen AC-078 bleibt erfüllt, weil die Wörter dort in die
   Spalte passen. Für das „…“ bei zu langen Wörtern bekommt `Text` eine Option (`wholeWords`), die
   im Web misst, ob ein Wort über die Breite ragt, und dann einzeilig kürzt; nativ tut sie nichts.
8. **REQ-005:** fest nach Breite (Handy kurz, sonst lang) statt gemessen: Die Kopfzeile gehört
   Spec 0054, und ein Titel, der je nach Tag die Form wechselt, springt (Spec 0035, AC-014).

## Daten

Keine Schema-Änderung. Gelesen und geschrieben wird wie bisher (`rateRecipe`, `rateRestaurant`,
`rateActivity`, `updatePlanEntry`). Neu in der Adresse: `von` auch am Kochmodus.

## Umsetzung

- [x] 1. core: `recapStackIndex` (AC-003–AC-007), `overviewTitle` mit kurzer Form
      (AC-025–AC-027), `placeAfter` mit Hervorhebung nach `von` (AC-014–AC-019),
      `tabPressAction` (AC-009–AC-012, AC-020), `kochen` mit `von` — Tests rot, dann grün
- [x] 2. ui: Anmeldung „nach oben“ in `Screen` und `InfiniteList` (`scroll-top.ts`, AC-009,
      AC-010, AC-013), Titel ohne automatische Trennung und `wholeWords` (AC-021–AC-024) — Tests
      rot, dann grün
- [x] 3. app: Tab-Leiste/Seitenleiste (`(tabs)/_layout.tsx`, `usePressSection`), Kochmodus mit
      `von` (eine Zeile in `recipe-detail.tsx`), „Wie war's?“ als Stapel und neue Reihenfolge,
      `wholeWords` in Heute-geplant-Karte, `MediaCard` (Rezepte-Raster) und Tageskachel,
      Datumstitel
- [x] 4. e2e: `rundgang-uebersicht-0057.spec.ts` (AC-001, AC-002, AC-004, AC-007, AC-009–AC-011,
      AC-014, AC-017, AC-018, AC-020, AC-021, AC-025, AC-026); die bestehenden Tests zu „Wie
      war's?“ (AC-036, AC-040 von Spec 0020) gelten unverändert. Nicht selbst ausgeführt (setzt die
      lokale Datenbank zurück), läuft beim Mergen.
- [x] 5. Ansehen: Desktop 1440 × 900 und Handy 390 × 844 gegen den eigenen Dev-Server,
      Screenshots in `tmp/review-0004/0057/` (`after-*.png`)

**Nachweis (27.11.2026):** Rot zuerst: `tmp/review-0004/0057/core-red.txt` (18 rote core-Tests),
`ui-red.txt` (5 rote Tests, 3 Dateien ohne Modul). Danach `pnpm format:check && pnpm check` grün
(17/17 Aufgaben), `pnpm build:web` grün. Am Dev-Server geprüft: Handy-Titel „Fr., 27. Nov.“
einzeilig; „Wie war's?“ unter „Zu tun“ und „Einkauf“ (Handy 177 px hoch, Desktop 183 px); erneuter
Tipp auf „Übersicht“ bzw. „Essen“ scrollt von 464 px bzw. 1200 px auf 0; ein Eintrag aus der
Übersicht hebt „Übersicht“ hervor (Handy und Desktop), „Übersicht“ führt von dort zurück zu `/`;
eine Aktivität mit `von=kalender` markiert am Desktop nur „Kalender“, ohne `von` nur „Aktivitäten“.
