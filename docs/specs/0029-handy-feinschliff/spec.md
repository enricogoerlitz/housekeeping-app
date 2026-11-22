---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-22
---

# 0029 — Handy-Feinschliff

**Quelle:** Enricos Wünsche vom 22.11.2026 (iPhone, installierte Web-App; vorab zu Review 0002).
**Kritischer Pfad:** nein (keine Datenbank, keine Anmeldung, kein Sync).

## Ziel

Auf dem iPhone fühlt sich die installierte Web-App wie eine App an: Ein Fenster von unten fährt
hoch, während der abgedunkelte Hintergrund an seinem Platz einblendet. Alles, was unten sitzt,
steht ein Stück über der Home-Leiste und nicht mehr in den runden Ecken. Zwischen Ansichts-Tabs
wechselt man mit einem Wisch, der dem Finger folgt. „Route“ öffnet die Karten-App, und zurück in der
App ist kein leeres Fenster mit „✕“ übrig.

## Nicht-Ziele

- Kein Wischen im Kalender: Woche, Monat und Jahr blättert Spec 0021; Kalenderkopf und Tages-Fenster
  bleiben, wie 0016/0021 sie bauen.
- Kein Wischen im Hinzufügen-Fenster („Was steht an?“, Tabs „Art“): Spec 0021 baut das Fenster um,
  und im Fenster gehört der Wisch nach unten dem Fenster.
- Kein Ziehen des Fensters nach unten zum Schließen und keine neuen Fenstergrößen.
- Keine nativen Apps (Spec 0015 ist geparkt); Desktop und Android behalten ihr Verhalten bis auf den
  Abstand über der Systemleiste, wo es eine gibt.

## Schon erledigt

- Sichere Ränder, `viewport-fit=cover`, Tab-Leiste und Fenster über der Home-Leiste: Spec 0019,
  REQ-008 (`shell.tsx` `TabBar`, `overlay.tsx` `Sheet`/`ToastHost`, Fußleisten in
  `shopping-mode-screen.tsx` und `cooking-screen.tsx`). Diese Spec legt den Abstand darüber fest.
- Wisch-Schwellen für Tage im Tages-Fenster: Spec 0016, `packages/ui/src/swipe-step.ts`
  (`claimsSwipe`); der Tab-Wisch nutzt dieselbe Regel, wann ein Zug seitwärts läuft.

## Anforderungen

„Handy“ = installierte Web-App auf einem iPhone mit Home-Leiste, Bedienung mit dem Finger.
„Desktop“ = Browser mit Maus ab 1024 px. Haushalt „Enrico & Nadja“.

### Fenster von unten

**REQ-001 — Hintergrund blendet ein, nur das Fenster fährt.** Auf dem Handy blendet der abgedunkelte
Hintergrund eines Fensters (`Sheet`) an seinem Platz ein, während nur das Fenster von unten
hochfährt; beim Schließen fährt das Fenster nach unten und der Hintergrund blendet aus. Mit
„Bewegung reduzieren“ blenden beide nur. Ab Tablet bleibt der Dialog beim Ein- und Ausblenden.
Quelle: Wunsch 1. Offline: vollständig.

- AC-001: Angenommen Handy, Liste · Wenn ich „+ Aus Kalender …“ tippe · Dann deckt der Hintergrund
  vom ersten Bild an den ganzen Bildschirm ab und wird nur dunkler, während das Fenster von unten
  hochfährt (250 ms); der Hintergrund bewegt sich nicht.
- AC-002: Angenommen das Fenster „Was soll auf die Liste?“ (aus „+ Aus Kalender …“) ist offen · Wenn ich daneben tippe, ✕ wähle oder im
  Browser zurückgehe · Dann fährt das Fenster nach unten, der Hintergrund blendet am Platz aus
  (200 ms), und erst danach ist das Fenster weg; ein Tipp während des Ausblendens öffnet nichts
  darunter.
- AC-003 (Rand): Angenommen „Bewegung reduzieren“ ist eingeschaltet · Wenn ich ein Fenster öffne und
  schließe · Dann bewegt sich nichts, Fenster und Hintergrund blenden nur ein und aus.
- AC-004 (Rand): Angenommen ein Fenster wird geschlossen und sofort wieder geöffnet (z. B. Zurück und
  Vor im Browser) · Dann steht es offen, ohne zu springen, und bleibt offen.

### Abstand über der Home-Leiste

**REQ-002 — Ein Abstand über der Home-Leiste.** Alles, was am unteren Bildschirmrand sitzt, steht auf
Geräten mit Home-Leiste um denselben Abstand `HOME_BAR_GAP` (8 pt) höher als der sichere Rand
(`safe-area-inset-bottom`): Tab-Leiste, Assistent-Knopf, Toasts, Fenster und ihre Fußleisten (z. B.
„Wähle mindestens ein Gericht“ im Fenster „+ Aus Kalender …“), die Fußleisten von Einkaufsmodus und Kochmodus.
Ohne Home-Leiste (sicherer Rand 0) bleibt alles, wie es ist. Quelle: Wunsch 2. Offline: vollständig.

- AC-005: Angenommen Handy mit Home-Leiste (sicherer Rand 34 pt), Übersicht · Dann enden die
  Beschriftungen der Tab-Leiste 42 pt über dem unteren Bildschirmrand (34 + 8), der Assistent-Knopf
  und ein Toast stehen entsprechend höher über der Tab-Leiste.
- AC-006: Angenommen Handy, Einkaufsmodus und Kochmodus (ohne Tab-Leiste) · Dann stehen
  „Fertig“ bzw. „Weiter“ 8 pt höher als bisher, und ein Toast steht über der Fußleiste.
- AC-007: Angenommen Handy, das Fenster „Was soll auf die Liste?“ (aus „+ Aus Kalender …“) ist offen, kein Gericht gewählt · Dann steht
  „Wähle mindestens ein Gericht“ samt Knopf 34 + 8 pt über dem unteren Rand.
- AC-008 (Rand): Angenommen Desktop oder ein Handy ohne Home-Leiste (sicherer Rand 0) · Dann sind
  Tab-Leiste, Fenster, Toasts und Fußleisten so hoch wie vor dieser Spec.

### Wischen zwischen Ansichts-Tabs

**REQ-003 — Wischen wechselt den Tab.** Auf dem Handy wechselt ein Wisch nach links in den nächsten,
nach rechts in den vorigen Ansichts-Tab (`ViewTabs`) auf: Haushalt („Anstehend“, „Alle“,
„Verlauf“), Essen („Rezepte“, „Restaurants“) und Märkte & Bereiche („Märkte“, „Bereiche“). Der
Inhalt folgt dem Finger, rastet beim Loslassen in den neuen Tab ein oder federt zurück; am ersten
und letzten Tab gibt er nur gedämpft nach. Der Wechsel ist derselbe wie ein Tipp auf den Tab
(Adresse ersetzt, Spec 0019 REQ-011). Quelle: Wunsch 3. Offline: vollständig.

- AC-009: Angenommen Handy, Haushalt „Anstehend“ · Wenn ich auf der Liste nach links wische
  (mindestens ein Fünftel der Breite oder ein schneller kurzer Wisch) · Dann folgt die Liste dem
  Finger, „Alle“ ist gewählt, die Adresse ist `/haushalt?ansicht=alle`, und der neue Inhalt schiebt
  sich von rechts herein.
- AC-010: Angenommen Handy, Essen „Restaurants“ · Wenn ich nach rechts wische · Dann ist „Rezepte“
  gewählt mit der zuletzt verlassenen Suche und den Filtern der Rezepte.
- AC-011 (Rand): Angenommen Handy, Haushalt „Anstehend“ · Wenn ich nach rechts wische · Dann gibt der
  Inhalt nur ein Stück nach, federt zurück, und „Anstehend“ bleibt gewählt; ebenso nach links auf
  „Verlauf“.
- AC-012 (Rand): Angenommen Handy · Wenn ich schräg, aber überwiegend senkrecht ziehe, einen Zug
  kürzer als ein Fünftel der Breite langsam loslasse, am linken oder rechten Rand (20 pt) beginne
  oder in einer waagrecht scrollenden Reihe, beim Wischen einer Zeile oder beim Ziehen zum Sortieren
  („Bereiche“) wische · Dann scrollt bzw. zieht nur das, und der Tab bleibt.
- AC-013 (Rand): Angenommen Desktop mit Maus · Wenn ich auf der Liste seitwärts ziehe · Dann wechselt
  kein Tab; Tastatur (Pfeiltasten auf den Tabs) und Screenreader bedienen die Tabs wie bisher.
- AC-014 (Rand): Angenommen „Bewegung reduzieren“ ist eingeschaltet · Wenn ich wische · Dann bewegt
  sich der Inhalt nicht; nach dem Loslassen über der Schwelle wechselt der Tab mit kurzem Einblenden.

### Route in die Karten-App

**REQ-004 — Route ohne leeres Fenster.** „Apple Karten“ und „Google Maps“ im Fenster „Route“ (Restaurant,
Aktivität, Kalendereintrag, Übersicht) öffnen in der installierten Web-App auf iPhone und iPad die
Karten-App direkt über ihr App-Schema in demselben Fenster (`maps://`, `comgooglemaps://`), ohne
neues Browser-Fenster; zurück in der App ist die Seite zu sehen, von der aus „Route“ gewählt wurde.
Ist Google Maps nicht installiert, öffnet sich nach kurzer Zeit die Website von Google Maps. Im
Browser-Tab, auf Android und am Desktop öffnet die Route wie bisher einen neuen Tab. Quelle:
Wunsch 4. Offline: vollständig (die Karten-App selbst braucht Netz).

- AC-015: Angenommen Handy, Restaurant „Trattoria Da Enzo“ mit Koordinaten · Wenn ich „Route“ →
  „Apple Karten“ wähle · Dann öffnet Karten mit „Trattoria Da Enzo“ als Ziel
  (`maps://?daddr=50.9271,6.958&q=Trattoria%20Da%20Enzo`) · Wenn ich in die App zurückkehre · Dann
  sehe ich die Restaurantseite ohne Fenster „Route“ und ohne leeres Fenster mit „✕“.
- AC-016: Angenommen Handy mit Google Maps, Aktivität „Eislaufen“ (Ort „Eisstadion
  Hohenschönhausen“) · Wenn ich „Route“ → „Google Maps“ wähle · Dann öffnet Google Maps mit dem Ziel
  (`comgooglemaps://?daddr=…`), und zurück in der App ist die Aktivität zu sehen.
- AC-017 (Fehler): Angenommen Handy ohne Google Maps · Wenn ich „Google Maps“ wähle · Dann öffnet nach
  1,5 s die Website `https://www.google.com/maps/dir/?api=1&destination=…`; verlässt die App die
  Seite vorher (Karten-App geöffnet), öffnet sich nichts zusätzlich.
- AC-018 (Rand): Angenommen Desktop oder Safari im Browser-Tab · Wenn ich „Apple Karten“ wähle · Dann
  öffnet sich wie bisher `https://maps.apple.com/?daddr=…` in einem neuen Tab, und die App bleibt im
  bisherigen Tab.

## Entscheidungen

Alle von Claude nach Enricos Regel „Empfehlung nehmen“ (22.11.2026).

1. Fenster-Bewegung: Das `Modal` animiert nicht mehr selbst (`animationType="none"`); der
   Hintergrund blendet (Deckkraft 0 → 1), nur das Fenster fährt (`translateY` von seiner Höhe auf
   0), 250 ms beim Öffnen, 200 ms beim Schließen, Kurve `ease-out` wie die übrigen Übergänge
   (DESIGN.md §7). Das Modal bleibt bis zum Ende des Ausblendens offen und nimmt dabei keine Tipps an.
   Grund: Bei `slide` schiebt react-native-web das ganze Modal samt Hintergrund (Wunsch 1).
2. „Bewegung reduzieren“ (`useReducedMotion`): nur Blenden, keine Fahrt; ab Tablet wie bisher nur
   Blenden.
3. Abstand über der Home-Leiste: ein Token `HOME_BAR_GAP = 8` (pt) in `packages/ui` und eine Funktion
   `bottomInset(sicherer Rand)` = sicherer Rand + 8, wenn er größer als 0 ist, sonst 0. Alle
   Elemente unten nutzen sie, auch ohne Tab-Leiste. Grund für 8: ein Schritt der Abstands-Skala
   (DESIGN.md §5); er hebt Beschriftungen und Knöpfe aus der Rundung der Ecken (Eckradius moderner
   iPhones ≈ 47–55 pt gegenüber 34 pt sicherem Rand), ohne die Tab-Leiste merklich höher zu machen
   (62 + 34 + 8 pt). Größere Werte (12, 16) fressen Platz für Listen; 4 pt ist kaum sichtbar.
4. Ohne Home-Leiste (sicherer Rand 0: Desktop, Android mit Tasten) kein zusätzlicher Abstand, damit
   Desktop und Tablet unverändert bleiben (AC-008).
5. Wisch-Bildschirme: Haushalt, Essen, Märkte & Bereiche — alle Seiten mit `ViewTabs` außer dem
   Kalender (Spec 0021), dem Hinzufügen-Fenster (Nicht-Ziel) und der Musterseite (nur Entwicklung).
6. Wisch-Regeln (rein, in `packages/ui/src/tab-swipe.ts`, in Node getestet): übernommen wird ein Zug,
   der mindestens 10 pt und doppelt so weit seitwärts wie senkrecht läuft (`claimsSwipe`, Spec 0016)
   und nicht in den äußeren 20 pt beginnt (Zurück-Geste des Systems); er wechselt beim Loslassen ab
   einem Fünftel der Breite (mindestens 48 pt) oder als schneller Wisch (≥ 0,4 pt/ms über ≥ 16 pt);
   am ersten und letzten Tab folgt der Inhalt nur zu einem Viertel, höchstens 64 pt.
7. Wisch-Bewegung: Folgen 1 : 1 mit dem Finger; beim Einrasten fährt der alte Inhalt in 180 ms aus,
   der neue kommt aus 30 % der Breite von der anderen Seite in 220 ms mit Einblenden (nicht aus der
   vollen Breite, weil der neue Inhalt erst beim Wechsel entsteht); beim Zurückfedern eine Feder ohne
   Überschwingen.
8. Vorrang: Der Tab-Wisch übernimmt erst nach den inneren Gesten (Zeile wischen, Ziehen zum
   Sortieren, Ziehen nach Spec 0016 nutzen die Fangphase und gewinnen); im Web beginnt er nicht in
   einer waagrecht scrollbaren Fläche. Nur mit Finger (`pointer: coarse`) und nur auf dem Handy.
9. Route auf iPhone/iPad in der installierten Web-App (`navigator.standalone` oder `display-mode:
standalone`): App-Schema in demselben Fenster (`location.href`), weil `window.open` dort ein
   eigenes Browser-Fenster öffnet, das leer zurückbleibt, wenn ein Universal Link in die App springt
   (WebKit-Fehler 199029). Apple: `maps://` mit denselben Parametern wie `maps.apple.com`
   (`daddr`, `q`); Google: `comgooglemaps://?daddr=…` (Google-Doku „Maps URL Scheme for iOS“).
10. Google Maps nicht installiert: nach 1,5 s, wenn die Seite weiter sichtbar ist und nicht den Fokus
    verloren hat, die Website in einem neuen Fenster (sie zeigt Inhalt, bleibt also nicht leer);
    Apple Karten ist auf jedem iPhone vorhanden und hat keinen Ersatz.
11. OFFEN: Ob iOS vor dem Öffnen per App-Schema in der installierten Web-App nachfragt („In „Karten“
    öffnen?“) und ob der Ersatz dann zu früh greift, prüft Enrico auf dem iPhone; die aktuelle
    Apple-Doku („Adopting unified Maps URLs“) beschreibt nur `https://maps.apple.com`, das Schema
    `maps:` steht nur in der archivierten Doku. Annahme: Die Rückfrage nimmt der Seite den Fokus,
    der Ersatz greift dann nicht.
12. Beim Bau: Der Tab-Wisch nutzt `PanResponder` wie `SwipeArea` und `DockedPanel` (Gesture Handler
    ist keine Abhängigkeit der App); er setzt nur Shared Values, Folgen und Einrasten laufen über
    Reanimated. Die Richtung, aus der der neue Tab kommt, überlebt das Neu-Aufbauen der Seite
    (Essen tauscht zwischen Rezepten und Restaurants den ganzen `Screen`).
13. Beim Bau: Chromium hat keine Home-Leiste; den Abstand selbst (AC-005–AC-007) prüfen Unit-Tests
    von `bottomInset`, der e2e-Test nur AC-008.

## Daten

Keine Datenbank-, RLS-, Sync- oder Adress-Änderung. Keine personenbezogenen Daten.
Entfällt: `animationType="slide"` am `Sheet`; die Abstände `insets.bottom` ohne Zuschlag an Tab-Leiste,
Assistent-Knopf, Toast, Fenster und den beiden Fußleisten; `Linking.openURL` im Fenster „Route“ im
Web.

## Umsetzung

- [x] 1. `packages/ui`: `HOME_BAR_GAP`, `bottomInset` mit Tests; Tab-Leiste, Assistent-Knopf, Toast,
      Fenster, Einkaufsmodus, Kochmodus darauf (AC-005–AC-008).
- [x] 2. `packages/ui`: `Sheet` mit eigener Bewegung (Hintergrund blendet, Fenster fährt),
      reduzierte Bewegung, Schließen erst nach dem Ausblenden (AC-001–AC-004).
- [x] 3. `packages/ui`: reine Wisch-Regeln `tab-swipe.ts` mit Tests; `Screen` nimmt `tabSwipe` an und
      bewegt den Inhalt (AC-009–AC-014).
- [x] 4. Haushalt, Essen (Rezepte und Restaurants), Märkte & Bereiche geben `tabSwipe` an
      (AC-009–AC-011).
- [x] 5. `packages/core`: App-Schema-Links und Wahl der Öffnungsart mit Tests; `RouteSheet` öffnet
      darüber (AC-015–AC-018).
- [x] 6. e2e-Tests (nur typgeprüft) in `e2e/rundgang-handy.spec.ts` für AC-001, AC-002, AC-008–AC-012,
      AC-015, AC-018.
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün; e2e-Typprüfung grün. Offen:
      iPhone als installierte Web-App (Enrico, Entscheidung 11), `/ui-verify` in Spec 0028.
