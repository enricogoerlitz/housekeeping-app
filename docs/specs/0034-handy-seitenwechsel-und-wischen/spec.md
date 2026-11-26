---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
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
weiter den Zeitraum. Quelle: H-03. Offline: offline vollständig.

- AC-013: Angenommen Handy, Kalender „Monat“ · Wenn ich unter dem Raster nach links wische · Dann ist
  „Jahr“ gewählt
- AC-014: Angenommen Handy, Kalender „Monat November“ · Wenn ich im Raster nach links wische · Dann
  steht „Dezember“ da und die Ansicht bleibt „Monat“

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
  quer halte · Dann siehe Entscheidung 4

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
4. OFFEN (REQ-009): iOS ignoriert die Hochformat-Angabe der Web-App weitgehend. Annahme: Manifest
   `orientation: portrait` (wirkt auf Android) und auf dem iPhone im Querformat ein Hinweis „Bitte
   Handy hochkant halten“ über der App statt verzerrter Ansicht. Alternative: Querformat einfach
   zulassen.
5. REQ-010: Wake Lock in installierten iOS-Apps ab iOS 18.4; nach Rückkehr in die App wird er neu
   angefordert. Der Haken aus dem Kochmodus wird gemeinsam genutzt.

## Daten

Entfällt: nur Oberfläche und lokale Reihenfolge der Liste (REQ-008, nur im Speicher der Sitzung).

## Umsetzung

- [ ] 1. `asyncRoutes` aus, Bundle messen; Platzhalter-Baustein mit 400-ms-Verzögerung (AC-001–AC-003)
- [ ] 2. Stack-Übergang Handy, Geste erkennen, Scroll-Lage halten (AC-004–AC-008)
- [ ] 3. Bilder: aufgelöste Adressen im Speicher halten, Fläche + Einblenden (AC-009, AC-010)
- [ ] 4. Übersicht `SwipeArea` (AC-011, AC-012)
- [ ] 5. Kalender: `tabSwipe` auf freier Fläche (AC-013, AC-014)
- [ ] 6. Reihenfolge-Speicher der Listen + Wischen auf Detailseiten (AC-017–AC-019)
- [ ] 7. Manifest/Hinweis Querformat (AC-020, AC-021), Wake Lock im Einkaufsmodus (AC-022, AC-023)
- [ ] 8. Rezeptlinks wie Route öffnen (AC-024)
- [ ] 9. Tab-Wischen mit Vorschau (AC-015, AC-016)
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün; `/ui-verify`;
      iPhone-Abnahme durch Enrico in der Vorschau
