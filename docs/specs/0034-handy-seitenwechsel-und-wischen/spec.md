---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0034 — Handy: Seitenwechsel, Laden und Wischen

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
H-01, H-03, H-04, H-07, H-08, H-09, H-10, H-12, E-14, E-16) und die Videos (`tmp/review-0003/
video-befunde.md`). **Welle 1.** **Kritischer Pfad:** nein.

## Ziel

Seitenwechsel auf dem iPhone sind flüssig: Eine neue Seite steht sofort mit Überschrift da, beim
Zurückwischen flackert nichts, der Zurück-Knopf gleitet wie die Geste, und Bilder ploppen nicht auf.
Man wischt durch Tage, Kalender-Ansichten, Tabs und Rezepte. Das Handy bleibt im Hochformat und
beim Einkaufen an, und ein Rezeptlink öffnet sich ohne leere Seite.

## Nicht-Ziele

- Kein Nachladen per Herunterziehen (Pull-to-Refresh): Änderungen kommen über den Sync von selbst
  (Enrico, Review 0003).
- Keine neuen Wisch-Schwellen für bestehende Gesten; Zeitraum-Wischen im Kalender bleibt, wie es ist.
- Keine Animationen am Desktop außer den bestehenden.

## Schon erledigt

- Tab-Wischen unter Essen, Haushalt, Märkte (Spec 0029 REQ-003, Spec 0030; `tab-swipe-area.tsx`).
- „Route“ öffnet in der installierten iOS-App ohne leere Seite (Spec 0029 REQ-004, `open-route.ts`).
- Bildschirm bleibt im Kochmodus an (`use-wake-lock.ts`).

## Anforderungen

„Handy“ = installierte Web-App auf dem iPhone (Android gleich).

### Seitenwechsel und Laden

**REQ-001 — Überschrift sofort.** Jede Seite zeigt beim ersten Aufruf in der Sitzung ihre
Überschrift ohne leeres Zwischenbild; Daten aus dem lokalen Speicher folgen ohne Ladeanzeige. Braucht
etwas länger als 400 ms, erscheint ein ruhiger Platzhalter in der Form des Inhalts (kein Spinner).
Quelle: H-08. Offline: offline vollständig.

- AC-001: Angenommen die App ist frisch geöffnet · Wenn ich „Verwalten“ → „Aktivitäten“ tippe ·
  Dann steht im ersten gezeichneten Bild der neuen Seite die Überschrift „Aktivitäten“
- AC-002: Angenommen die Daten einer Seite brauchen 1 s · Wenn ich die Seite öffne · Dann erscheint
  nach 400 ms ein Platzhalter in Listenform, vorher nichts außer der Überschrift
- AC-003: Angenommen die Daten brauchen 200 ms · Wenn ich die Seite öffne · Dann erscheint kein
  Platzhalter

**REQ-002 — Zurückwischen ohne Flackern.** Nach der iOS-Zurückgeste erscheint die vorige Seite
einmal, in ihrer Scroll-Lage, ohne erneutes Aufbauen. Quelle: H-07. Offline: offline vollständig.

- AC-004: Angenommen iPhone, Restaurants bis „Coccodrillo“ gescrollt, „AMRIT“ geöffnet · Wenn ich
  vom linken Rand zurückwische · Dann steht die Liste ohne Aufblitzen an derselben Stelle
- AC-005: Angenommen derselbe Ablauf mit dem Zurück-Knopf · Dann ebenso

**REQ-003 — Zurück-Knopf und Öffnen gleiten.** Auf dem Handy gleitet eine geöffnete Seite von rechts
herein und beim Zurück-Knopf nach rechts hinaus (wie die iOS-Geste); bei der Wischgeste läuft keine
zweite Animation. Bei „Bewegung reduzieren“ wird nur überblendet. Quelle: H-12. Offline: offline
vollständig.

- AC-006: Angenommen Handy, Rezept „Apfelkuchen“ offen · Wenn ich „‹ Essen“ tippe · Dann gleitet
  die Seite nach rechts weg und gibt die Liste frei (etwa 300 ms)
- AC-007: Angenommen iPhone · Wenn ich vom Rand zurückwische · Dann folgt nach dem Loslassen keine
  weitere Gleit-Animation
- AC-008: Angenommen „Bewegung reduzieren“ ist an · Wenn ich „‹ Essen“ tippe · Dann wird nur
  überblendet

**REQ-004 — Bilder ohne Aufploppen.** Vorschaubilder in Listen und auf Detailseiten haben während
des Ladens eine Fläche in ihrer endgültigen Größe und blenden weich ein; ein schon geladenes Bild
erscheint beim erneuten Öffnen sofort. Quelle: Video-Befund. Offline: offline lesend (Bilder aus
dem lokalen Speicher).

- AC-009: Angenommen die Restaurantliste war schon offen · Wenn ich sie erneut öffne · Dann sind die
  Bilder im ersten Bild da
- AC-010: Angenommen ein Bild lädt noch · Dann steht an seiner Stelle eine ruhige Fläche gleicher
  Größe, und der Text daneben verschiebt sich beim Einblenden nicht

### Wischen

**REQ-005 — Übersicht: Tage wischen.** Wischen nach links zeigt den nächsten, nach rechts den
vorigen Tag. Quelle: H-01. Offline: offline vollständig.

- AC-011: Angenommen Handy, Übersicht „Donnerstag, 26. November“ · Wenn ich nach links wische ·
  Dann steht „Freitag, 27. November“ da und in der Tagesleiste ist der 27. gewählt
- AC-012: Angenommen in der Übersicht scrollt eine Zeile waagerecht (Essen des Tages) · Wenn ich
  darin wische · Dann scrollt die Zeile, der Tag bleibt

**REQ-006 — Kalender: Ansicht wischen.** In der freien Fläche unter dem Raster (Monat, Jahr) und unter
„Vorgemerkt“ (Woche) wechselt Wischen die Ansicht Woche ↔ Monat ↔ Jahr; im Raster wechselt Wischen
weiter den Zeitraum. Im Jahr zählt nur die Fläche der zwölf Monate als Raster; „Vorgemerkt“ und
„Reisen“ darunter wechseln die Ansicht (Welle 2). Quelle: H-03. Offline: offline vollständig.

- AC-013: Angenommen Handy, Kalender „Monat“ · Wenn ich unter dem Raster nach links wische · Dann ist
  „Jahr“ gewählt
- AC-014: Angenommen Handy, Kalender „Monat November“ · Wenn ich im Raster nach links wische · Dann
  steht „Dezember“ da und die Ansicht bleibt „Monat“
- AC-025: Angenommen Handy, Kalender „Jahr 2026“ · Wenn ich auf „Reisen 2026“ (oder „Vorgemerkt“)
  nach rechts wische · Dann ist „Monat“ gewählt
- AC-026: Angenommen Handy, Kalender „Jahr 2026“ · Wenn ich über den Monaten nach links wische ·
  Dann steht „2027“ da und die Ansicht bleibt „Jahr“

**REQ-007 — Tab-Wischen mit Vorschau.** Beim Wischen zwischen Tabs folgt der Inhalt dem Finger, und
der Nachbar-Tab ist daneben schon zu sehen. Quelle: H-04. Offline: offline vollständig.

- AC-015: Angenommen Handy, Essen „Rezepte“ · Wenn ich halb nach links wische und halte · Dann sehe
  ich links die Hälfte der Rezepte und rechts die Hälfte der Restaurants
- AC-016: Angenommen dasselbe · Wenn ich loslasse, bevor die Schwelle erreicht ist · Dann federt
  „Rezepte“ zurück

**REQ-008 — Durch Einträge wischen.** Auf der Seite eines Rezepts, einer Sammlung oder eines
Restaurants wechselt Wischen nach links/rechts zum nächsten/vorigen Eintrag in der Reihenfolge der
Liste, aus der ich kam (auch „Zufall“). Ohne Liste (z. B. aus dem Kalender) gibt es kein Wischen.
Quelle: E-16. Offline: offline vollständig.

- AC-017: Angenommen Rezepte „A–Z“: „Apfelkuchen“, „Arayes“ · Wenn ich in „Apfelkuchen“ nach links
  wische · Dann ist „Arayes“ offen, und „‹ Essen“ führt zur Liste
- AC-018: Angenommen „Arayes“ ist der letzte Eintrag · Wenn ich nach links wische · Dann federt die
  Seite zurück
- AC-019: Angenommen das Rezept wurde aus dem Kalender geöffnet · Wenn ich wische · Dann passiert
  nichts

### Gerät

**REQ-009 — Hochformat.** Auf dem Handy bleibt die App im Hochformat, soweit das System es zulässt.
Quelle: H-09. Offline: offline vollständig.

- AC-020: Angenommen Android, installierte App · Wenn ich das Handy quer halte · Dann bleibt die
  Ansicht im Hochformat
- AC-021: Angenommen iPhone, installierte App, iOS lässt die Sperre nicht zu · Wenn ich das Handy
  quer halte · Dann liegt über der App „Bitte Handy hochkant halten“, und
  hochkant ist alles wie vorher

**REQ-010 — Bildschirm bleibt im Einkaufsmodus an.** Quelle: H-10. Offline: offline vollständig.

- AC-022: Angenommen iPhone mit iOS ≥ 18.4, Einkaufsmodus offen · Wenn ich 5 Minuten nichts tippe ·
  Dann bleibt der Bildschirm an
- AC-023: Angenommen ich verlasse den Einkaufsmodus · Dann gilt wieder die normale Sperrzeit

**REQ-011 — Rezeptlink ohne leere Seite.** Ein Link im Rezept öffnet in der installierten iOS-App die
Seite, ohne dass eine leere Seite mit X zurückbleibt. Quelle: E-14. Offline: nur online (Link braucht
Netz).

- AC-024: Angenommen iPhone, installierte App, Rezept mit Link „chefkoch.de/…“ · Wenn ich den Link
  tippe und danach zur App zurückkehre · Dann steht die App auf der Rezeptseite, ohne leeres Fenster

## Entscheidungen

1. REQ-001: Route-Code wird im Web nicht mehr einzeln nachgeladen (`asyncRoutes` aus); der Service
   Worker lädt ohnehin alles vor. Bundle-Größe vor/nach im Nachweis. Platzhalter erst nach 400 ms
   (zeigt sich bei schnellem Laden nie).
2. REQ-002/003: Seitenwechsel als eigene Gleit-Animation des Stacks auf dem Handy; wird der
   Wechsel durch die iOS-Geste ausgelöst (popstate während Touch am Rand), läuft keine Animation.
   Geprüft wird am Gerät; Flackern ist im Simulator nicht sicher nachstellbar.
3. REQ-007 ist der größte Brocken (beide Tabs gleichzeitig gerendert). Kommt als letzte Aufgabe der
   Welle; wird sie zu teuer, melde ich das, statt abzuspecken.
4. REQ-009 (Enrico, 26.11.): Manifest `orientation: portrait` (wirkt auf Android); auf dem iPhone
   liegt im Querformat ein Hinweis „Bitte Handy hochkant halten“ über der App.
5. REQ-010: Wake Lock in installierten iOS-Apps ab iOS 18.4; nach Rückkehr in die App wird er neu
   angefordert. Der Haken aus dem Kochmodus wird gemeinsam genutzt.
6. REQ-001 (Umsetzung): Die Daten kommen synchron aus dem Speicher; was wirklich wartet, ist die
   Online-Liste „Deine Geräte“. Dort steht der Platzhalter `ListPlaceholder` (UI-Paket) statt
   „Wird geladen …“.
7. REQ-002/003 (Umsetzung): Auf dem Handy im Browser nutzt der Stack jedes Bereichs den JS-Stack von
   Expo Router (der native Stack kann im Web nicht animieren): 300 ms Gleiten von rechts, bei
   „Bewegung reduzieren“ 200 ms Überblenden; breitere Fenster behalten den nativen Stack ohne
   Bewegung. Die iOS-Randgeste erkennt die reine Funktion `systemSwipeNavigation` (UI-Paket,
   `edge-swipe.ts`): letzte Berührung am Rand (≤ 24 px), wurde zur Wischbewegung (≥ 10 px oder vom
   System abgebrochen), danach `popstate` → kein Gleiten. Ein Tipp auf „‹ Essen“ am Rand gleitet.
   Die Scroll-Lage der Liste bleibt ohne eigenen Code: Seite und Liste bleiben im Stack erhalten,
   Chromium und WebKit stellen die Lage nach `display: none` selbst wieder her (gemessen, siehe
   Nachweis).
8. REQ-004 (Umsetzung): Aufgelöste Foto-Adressen bleiben nach dem Schließen einer Seite im Speicher
   (höchstens 24, die älteste fällt heraus; Abmelden gibt alle frei). Während ein eigenes Foto lädt,
   steht eine ruhige Fläche ohne Symbol. Rezept-Kacheln mit Beispielfotos zeigen beim Laden weiter
   das Symbol.
9. REQ-006 (Umsetzung): Der Kalender bekommt den `tabSwipe` des Bildschirms; das Raster behält sein
   Zeitraum-Wischen, weil es den Finger zuerst nimmt und nicht mehr abgibt. In der Jahresansicht
   liegen „Vorgemerkt“ und „Reisen“ im Raster-Bereich (Datei der Jahresansicht nicht angefasst, die
   ändert Spec 0035); dort wechselt Wischen das Jahr, darunter die Ansicht. Welle 2: Die
   Jahresansicht legt das Zeitraum-Wischen (`CalendarSwipe`) nur noch um die zwölf Monate
   (`gridSwipe`); „Vorgemerkt“ und „Reisen“ gehören zur freien Fläche (AC-025, AC-026).
10. REQ-008 (Umsetzung): Die Reihenfolge merkt sich die Liste beim Öffnen (Rezepte, Inhalt einer
    Sammlung, Restaurants); jedes andere Öffnen vergisst sie. Wischen ersetzt die Seite (kein neuer
    Verlaufseintrag) und nutzt die Tab-Wisch-Fläche: Inhalt folgt dem Finger, am Ende federt er
    zurück.
11. REQ-011 (Umsetzung): In der installierten iOS-App öffnet ein unsichtbarer Link mit
    `target=_blank` die Seite statt `window.open`; gilt auch für „Webseite“ bei Restaurant und
    Aktivität (gleicher Fehler). Sonst wie bisher neuer Tab.
12. REQ-007 (Umsetzung, Welle 2; vorher OFFEN mit Entwurf und 2–3 Tagen Aufwand): Statt jeden
    Tab-Inhalt als eigenen `…TabBody` herauszulösen, zeichnet ein Bildschirm den Nachbarn als
    sich selbst: `tabSwipe(optionen, wert, onChange, vorschau)` bekommt eine vierte Funktion, die
    dieselbe Seite unter `PagePreview` (`url-state.ts`) mit den Adress-Parametern des Nachbar-Tabs
    zeichnet (ohne Fenster und ausgewähltes Objekt; bei Essen die zuletzt verlassenen
    Listen-Parameter, im Kalender Zeitraum und Tag wie beim Tippen). `usePageParams` liest darin
    diese Parameter und schreibt nichts, auch keine Bereinigung. `TabSwipeArea` zeichnet den
    Nachbarn erst, wenn das Wischen den Finger übernimmt, und nur auf der Seite, zu der der
    Inhalt geschoben wird (als Transition: der Inhalt folgt dem Finger sofort, der Nachbar
    erscheint, sobald er gezeichnet ist); er steht absolut um eine Breite versetzt in derselben
    verschobenen Zeile, nimmt keine Berührung an und ist für Screenreader verborgen. Ein `Screen`
    darin (`TabPreviewContext`) zeichnet nur seinen Inhalt im Rahmen der Seite daneben (ohne Kopf,
    Tabs, Werkzeugleiste, Seitenfenster). Listen zeigen dort ihre gemerkte Scroll-Lage, ändern sie
    aber nicht; der Kalender rollt nur die Vorschau zu heute (nicht die Seite daneben); die
    KI-Suche sendet aus der Vorschau nichts. Loslassen: Die Schwelle bleibt (ein Fünftel der
    Breite, mindestens 48 pt, oder ein Wurf). Darüber läuft der Inhalt als Feder mit der
    Geschwindigkeit des Fingers ohne Überschwingen eine ganze Breite weiter, dann wechselt der Tab
    ohne zweite Ankunfts-Animation; die Vorschau verschwindet ein Bild später. Darunter federt er
    zurück, die Vorschau verschwindet, wenn er steht. Eine Seite, die für den neuen Tab neu
    entsteht (Essen tauscht den ganzen `Screen`), übernimmt die gemessene Kopfhöhe der alten, und
    ein Kachel-Raster seine zuletzt gemessene Breite (je `restoreKey`), damit kein leeres Bild
    dazwischen liegt (gemessen: keins). „Bewegung reduzieren“: nichts verschiebt sich, kein
    Nachbar, der Tab wechselt beim Loslassen mit Überblenden (wie bisher). Reine, getestete
    Entscheidungen: `tabSwipePreviewStep`, `tabSwipeSettle`, `tabSwipeStep`. Ohne Vorschau
    (Durch Einträge wischen, REQ-008) bleibt das bisherige Gleiten. Bekannte Grenze: Kopf,
    Tabs und Suchzeile bleiben während des Wischens die des aktuellen Tabs; nur der Inhalt
    darunter zeigt den Nachbarn.
13. REQ-003 (QA-Nachtrag 26.11.): „Verwalten“, seine Seiten und die Einstellungen sind eigene Tabs
    der Tab-Navigation, kein Stack; darum glitten sie auf dem Handy nicht. Ohne Umbau der Routen
    bekommen sie auf dem Handy im Browser eine Gleit-Animation des Tab-Navigators
    (`phoneTabOptions`, `stack-transition.ts`): nach der Reihenfolge der Tabs gleitet die neue
    Seite von rechts herein („⊞ → Verwalten“, „Verwalten → Aktivitäten“) und bei „‹ Verwalten“
    nach rechts hinaus, 300 ms; mit „Bewegung reduzieren“ nur Überblenden; nach der Randgeste ohne
    zweite Animation. Die Tabs der Tab-Leiste wechseln weiter sofort.
    OFFEN: „‹ Haushalt“ (Zurück von „Verwalten“ auf eine Seite der Tab-Leiste) gleitet nicht
    sichtbar: der Tab-Navigator legt die neue Seite immer oben auf, die gehende Seite gleitet
    darunter. Abhilfe nur durch Umbau (Verwalten-Seiten als Stack über den Tabs, alle Adressen und
    `backBehavior` betroffen); Empfehlung: so lassen, nach der iPhone-Abnahme entscheiden.

14. REQ-002 (H-07, nach Enricos Test am 26.11.: nach der Randgeste blitzt die Liste noch einmal,
    beim Zurück-Knopf nicht): Ursache im Browser gemessen. Unter einer offenen Seite lag die Liste
    mit `display: none` (JS-Stack, `detachInactiveScreens`); beim Zurück stand sie zwei Bilder lang
    oben (Karte bei 265 statt 485 px), bis der Browser die Scroll-Lage wiederherstellte. Beim
    Zurück-Knopf verdeckt das Hinausgleiten das, nach der iOS-Geste (sofort, Entscheidung 7) nicht.
    Jetzt bleibt die Seite darunter ausgelegt (`detachPreviousScreen: false` in
    `phoneStackOptions`): sie wird nicht neu gezeichnet, Bilder nicht neu dekodiert, die Lage
    stimmt im ersten Bild (gemessen: 485 px in jedem Bild). Ob das iOS-Standbild jetzt nahtlos in
    die Seite übergeht, zeigt nur das iPhone. Falls nicht, die nächsten Schritte: beim `popstate`
    nach der Geste das Neuzeichnen um ein Bild verzögern (iOS hält das Standbild, bis die Seite
    gezeichnet hat) oder `content-visibility` für die verdeckte Seite.
15. Fehler aus Enricos Test am 26.11.: „Einkaufen“ ließ sich auf dem iPhone nicht scrollen. Ursache:
    der JS-Stack des Handys (Entscheidung 7) macht eine Karte, die das ganze Fenster füllt (ohne
    Tab-Leiste: „Einkaufen“, „Kochen“), zur mitwachsenden Seite (`minHeight: 100%`, gedacht für
    ein scrollendes Dokument); der `body` der App scrollt aber nie, also hatte der ScrollView der
    Seite keine Höhe. Behoben mit `headerMode: 'float'` (es gibt keinen Kopf; die Karte bleibt ein
    begrenzter Kasten). Wake Lock und Seiten-Sperre waren es nicht; der Wake Lock bleibt.

## Daten

Entfällt: nur Oberfläche und lokale Reihenfolge der Liste (REQ-008, nur im Speicher der Sitzung).

## Umsetzung

- [x] 1. `asyncRoutes` aus, Bundle messen; Platzhalter-Baustein mit 400-ms-Verzögerung (AC-001–AC-003)
- [x] 2. Stack-Übergang Handy, Geste erkennen, Scroll-Lage halten (AC-004–AC-008)
- [x] 3. Bilder: aufgelöste Adressen im Speicher halten, Fläche + Einblenden (AC-009, AC-010)
- [x] 4. Übersicht `SwipeArea` (AC-011, AC-012)
- [x] 5. Kalender: `tabSwipe` auf freier Fläche (AC-013, AC-014)
- [x] 6. Reihenfolge-Speicher der Listen + Wischen auf Detailseiten (AC-017–AC-019)
- [x] 7. Manifest/Hinweis Querformat (AC-020, AC-021), Wake Lock im Einkaufsmodus (AC-022, AC-023)
- [x] 8. Rezeptlinks wie Route öffnen (AC-024)
- [x] 9. Tab-Wischen mit Vorschau (AC-015, AC-016), Entscheidung 12 (Welle 2)
- [x] 10. Jahresansicht: „Vorgemerkt“ und „Reisen“ wechseln die Ansicht (AC-025, AC-026)
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün (26.11.); `/ui-verify`;
      iPhone-Abnahme durch Enrico in der Vorschau (offen)

## Nachweis

- Nachtrag nach Enricos Test (26.11.): `apps/app/scripts/stack-options.test.mjs` (Einkaufen: Karte
  begrenzt, rot gezeigt; AC-004: Seite darunter ausgelegt, rot gezeigt; Regel im Router gepinnt),
  e2e `rundgang-handy.spec.ts` „Einkaufen“ füllt das Fenster (nur typgeprüft). Dev-Server (Port
  8095), Chromium 390 × 844 mit Touch: vorher ScrollView 1414 px hoch in 844 px Fenster, Wischen
  ohne Wirkung; nachher 773 px, Wischen scrollt 641 px. Randgeste + Verlauf zurück: Karte in jedem
  Bild an derselben Stelle (vorher zwei Bilder 220 px zu hoch).

- Tests (rot gezeigt, dann grün): `app-config.test.mjs` (AC-001, AC-020), `placeholder.test.tsx`
  (AC-002, AC-003), `photos-remote.backend.test.ts` (AC-009, Speicher-Grenze, Abmelden),
  `display.test.tsx` (AC-010), `swipe-area.test.tsx` (AC-012), `tab-swipe-area.test.tsx`
  (AC-013/AC-014), `browse-order.test.ts` (AC-017–AC-019), `edge-swipe.test.ts` (AC-006, AC-007),
  `portrait-hint.test.ts` (AC-021), `wake-lock.test.ts` (AC-022, AC-023), `open-in-new-tab.test.ts`
  (AC-024).
- Web-Bundle (`pnpm build:web`, `dist/_expo/static/js/web`): vorher 39 JS-Dateien, 7 396 784 B
  (gzip-Summe 1 482 055 B); nur mit `asyncRoutes` aus 2 JS-Dateien (App + Spracherkennung),
  7 390 892 B (gzip-Summe 1 459 063 B); mit der ganzen Spec (JS-Stack u. a.) 7 466 481 B (gzip-Summe
  1 477 232 B).
- Dev-Server (Port 8092, Chromium 390 × 844 mit Touch): Übersicht wischt Do 26. → Fr 27. → zurück;
  Kalender Monat: Wischen im Raster → Dezember, darunter → Jahr; Rezept aus der Liste wischt zum
  nächsten; Seite gleitet beim Öffnen und bei „‹ Essen“ in ~300 ms, nach Randgeste (Touch am
  Rand + Abbruch + Verlauf zurück) ohne Gleiten, mit „Bewegung reduzieren“ ohne Verschiebung;
  Deep-Link Rezept → „‹ Essen“ → Liste; Querformat zeigt den Hinweis, hochkant nicht. Scroll-Lage
  nach Zurück: Chromium und WebKit 600 px vorher, 600 px nachher, derselbe Listen-Knoten (kein
  Neuaufbau). Keine Konsolenfehler auf neun Seiten an Handy- und Desktop-Breite. Screenshots in
  `tmp/review-0003/0034/`.
- Nur am iPhone prüfbar: AC-004/AC-007 (Flackern, Randgeste), AC-020 (Android-Sperre), AC-021
  (installierte App), AC-022 (Wake Lock ab iOS 18.4), AC-024 (Link ohne leeres Fenster), Gefühl
  der Wisch-Gesten.
- QA-Nachtrag 26.11. (Entscheidung 13): Dev-Server 390 × 844 – „⊞ → Verwalten“ und „Verwalten →
  Aktivitäten“ gleiten in ~300 ms von rechts herein, „‹ Verwalten“ nach rechts hinaus; Tabs der
  Tab-Leiste wechseln sofort. `pnpm check` grün.
- Welle 2 (REQ-007, Jahresansicht): Tests rot gezeigt, dann grün – `tab-swipe.test.ts`
  (AC-015, AC-016: `tabSwipePreviewStep`, `tabSwipeSettle`, `tabSwipe(…, vorschau)`),
  `tab-swipe-area.test.tsx` (AC-015: Nachbar erst nach Übernahme, ±Breite daneben, verborgen;
  Seite darin nur Inhalt; neu entstehende Seite sofort sichtbar; AC-016: Zurückfedern; reduzierte
  Bewegung ohne Nachbar), `infinite-list.test.tsx` (Scroll-Lage aus der Vorschau unverändert,
  Raster ohne leeres erstes Bild); e2e `rundgang-wischen-0034.spec.ts` (AC-015, AC-016, AC-025,
  AC-026; AC-025 vorher rot: Wischen auf „Reisen“ blätterte zu 2025) gegen den Dev-Server
  (Port 8096, Chromium 390 × 844 mit Touch), dazu die bestehenden Wisch-Tests aus
  `rundgang-handy` und `rundgang-review-0002` grün (15/15). Gemessen je Bild beim Wechsel
  Rezepte → Restaurants: die erste Restaurant-Karte läuft von x 245 nach x 20 in ~340 ms, die
  echte Seite steht danach genau dort, kein Bild mit verdecktem Inhalt. Vorschau geprüft für
  Essen (beide Richtungen), Haushalt, Märkte, Kalender Woche → Monat (unter „Vorgemerkt“) und
  Jahr → Monat (auf „Reisen“); keine waagerechte Seitenverschiebung, keine Konsolenfehler; mit
  „Bewegung reduzieren“ kein Nachbar, Tab wechselt. Desktop 1440 × 900 unverändert. Screenshots
  in `tmp/review-0003/0034-wischen/`. Nur am iPhone prüfbar: Gefühl des Mitziehens und des
  Weiterlaufens, Ruckeln beim ersten Zeichnen des Nachbarn (zwei Listen gleichzeitig).
  `pnpm format:check && pnpm check && pnpm build:web` grün (26.11.). `/security-check` auf den
  Diff: keine Befunde (geprüft: Adress-Parameter der Vorschau stammen aus den schon geprüften
  Werten, `PagePreview` schreibt keine Adresse, aus der Vorschau geht keine Anfrage hinaus –
  KI-Suche aus –, keine neue Abhängigkeit, kein Speicher, kein HTML).
