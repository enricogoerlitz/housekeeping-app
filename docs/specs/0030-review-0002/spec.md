---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-23
---

# 0030 — Review 0002: Kalender, Reisen und Handy-Feinschliff

**Quelle:** Enricos Review 0002 der Testversion (22./23.11.2026, `tmp/__REVEWS/0002/REVIEW.md`,
zwei Bildschirmfotos), seine Rückmeldung zu Spec 0029 (Wischen zwischen Tabs) und seine Vorgabe
vom 23.11.2026 „Reisen wirken nur auf Haushaltsaufgaben“. Alle Punkte freigegeben, Claudes
Empfehlungen angenommen. **Kritischer Pfad:** ja: Migration (neue Spalte an `trips`, geänderte
Funktionen für Benachrichtigungen und Aufgaben).

## Ziel

Im Kalender bleiben beim Scrollen die Tage oben stehen, und eine Reise, die man über die Tage zieht,
lässt jeden Tag lesbar. „Reisen“ ist nach Monaten gegliedert und filterbar. Eine Reise kann erst
einmal nur ein Entwurf sein, zum Planen des Urlaubs, ohne dass sie schon Aufgaben oder Nachrichten
verändert. Eine Reise ändert nichts mehr am Essen: Wer unterwegs ist, kann trotzdem kochen, essen
gehen und etwas unternehmen; sie wirkt nur auf Haushaltsaufgaben (und schaltet Nachrichten still). Im Fenster „Einplanen“ springen die Tage beim Blättern nicht mehr, im
Hinzufügen-Fenster stehen die Tabs in einer sinnvollen Reihenfolge, und auf dem Handy wechselt ein
Wisch unter Haushalt und Essen wirklich den Tab.

## Nicht-Ziele

- Keine neue Kalenderansicht und keine geänderte Höhe der Tageszeiten; die Jahresansicht bleibt,
  wie sie ist (außer der Schraffur für Entwürfe).
- Kein eigener Status-Ablauf für Reisen (keine Erinnerung „Entwurf bestätigen?“, kein Ablaufdatum);
  ein Entwurf bleibt Entwurf, bis jemand ihn bestätigt oder löscht.
- Keine Änderung an den Datums-Chips der Haushaltsaufgaben (Spec 0026) und den Tageszeit-Chips;
  siehe Entscheidung 7.
- Kein Wischen in weiteren Bildschirmen und keine neuen Wisch-Schwellen; Spec 0029, REQ-003 gilt
  weiter, diese Spec repariert nur, dass es auf dem iPhone nicht greift.

## Anforderungen

„Handy“ = installierte Web-App auf dem iPhone, Bedienung mit dem Finger. „Desktop“ = ab 1100 px mit
Maus. Haushalt „Enrico & Nadja“, heute ist Montag, 23.11.2026.

### Kalender

**REQ-001 — Tage bleiben beim Scrollen oben.** In „Woche“ und „Monat“ bleibt die Kopfzeile der
Tage am oberen Rand des Scrollbereichs stehen, solange ihr Raster zu sehen ist: am Desktop in der
Woche die Zeile „Mo 23. Nov … So 29. Nov“, auf dem Handy in der Woche die Zeile des Tages
(„MO 23. NOV“), bis der nächste Tag sie hinausschiebt, im Monat die Zeile der Wochentage. Am
Desktop schreibt der Monat die Wochentage aus („Montag“, „Dienstag“, …); Tablet und Handy, Woche und
Jahr bleiben kurz. Quelle: Review 0002, Punkt 1. Offline: offline vollständig.

- AC-001: Angenommen Desktop, Woche KW 48 mit vielen Einträgen am Abend · Wenn ich bis „Abend“
  scrolle · Dann steht die Zeile „Mo 23. Nov … So 29. Nov“ weiter oben im Scrollbereich, auf
  Seitenfarbe, und die Einträge laufen darunter durch.
- AC-002: Angenommen Handy, Woche KW 48 · Wenn ich durch Montag scrolle · Dann bleibt „MO 23. NOV“
  unter der schmalen Leiste stehen, bis „DI 24. NOV“ sie hinausschiebt.
- AC-003: Angenommen Handy oder Desktop, Monat November 2026 · Wenn ich nach unten scrolle · Dann
  bleibt die Zeile der Wochentage oben stehen.
- AC-004: Angenommen Desktop (1280 px), Monat · Dann lauten die Köpfe „Montag“ bis „Sonntag“ ·
  Und auf dem Tablet (900 px) und dem Handy „Mo“ bis „So“, in der Woche weiter „Mo 23. Nov“.

**REQ-002 — Der Tag unter dem Finger bleibt lesbar.** Beim Ziehen einer Reise über die Tage sieht
der Tag unter dem Finger oder der Maus aus wie die übrigen markierten Tage: zart getönt, Zahl und
Einträge lesbar, dazu der Rahmen in der Akzentfarbe. Quelle: Review 0002, Punkt 2. Offline: nur
online (Ziehen einer Reise ist offline gesperrt, Spec 0016, AC-031).

- AC-005: Angenommen Monat, ich halte Mo 7.12. und ziehe bis Mi 9.12. · Dann sind 7. und 8.12. getönt
  · Und der 9.12. unter dem Finger ist ebenso getönt, mit Rahmen, und „9“ ist zu lesen.
- AC-006 (Rand): Angenommen ich ziehe einen Eintrag (keine Reise) auf eine Tageszeit · Dann sieht das
  Ziel aus wie bisher (Rahmen und Fläche, Spec 0016).

### Reisen

**REQ-003 — „Reisen“ nach Monaten gegliedert und filterbar.** Die Seite „Reisen“ zeigt zuerst
„Kommend“ (laufende und künftige Reisen, früheste zuerst), dann „Vergangen“ (neueste zuerst); in
beiden stehen die Reisen unter Monatsüberschriften „Dezember 2026“ nach ihrem Beginn. Jede Reise ist
eine Zeile mit einer Datumskachel (Wochentag und Tag des Beginns, in der Farbe des Streifens), Titel,
Zeitraum mit Dauer und wer mitfährt, rechts der Packstand. Ein Filter „Zeitraum“ wählt „Alle
Zeiträume“, ein Jahr oder einen Monat; er steht in der Adresse (`zeitraum=2026` oder
`zeitraum=2026-12`). Quelle: Review 0002, Punkt 3. Offline: offline lesend (Löschen braucht Netz,
Filtern nicht).

- AC-007: Angenommen „Mallorca“ 12.–19.12.2026, „Hamburg“ 4.–6.1.2027 und „Berlin“ 1.–3.10.2026 ·
  Wenn ich „Reisen“ öffne · Dann steht „Kommend“ mit „Dezember 2026“ (Mallorca) und „Januar 2027“
  (Hamburg) über „Vergangen“ mit „Oktober 2026“ (Berlin).
- AC-008: Angenommen dieselben Reisen · Wenn ich „Zeitraum“ → „Dezember 2026“ wähle · Dann steht nur
  „Mallorca“ da und die Adresse ist `/reisen?zeitraum=2026-12` · Wenn ich „2026“ wähle · Dann stehen
  „Mallorca“ und „Berlin“ da.
- AC-009: Angenommen eine Reise vom 28.12.2026 bis 4.1.2027 · Dann steht sie unter „Dezember 2026“
  und im Filter unter „Dezember 2026“ und „2026“, nicht unter „Januar 2027“.
- AC-010 (Rand): Angenommen die Adresse `/reisen?zeitraum=2030` und 2030 hat keine Reise · Dann steht
  „Keine Reisen in diesem Zeitraum.“ mit dem Knopf „Alle Zeiträume“ · Und `zeitraum=abc` wird
  ignoriert (alle Reisen).
- AC-011: Angenommen „Mallorca“ hat eine Packliste mit 3 von 18 gepackt · Dann zeigt die Zeile die
  Kachel „SA 12“, „Mallorca“, „12.–19. Dez · 8 Tage · Enrico & Nadja“ und „3/18 gepackt“.

**REQ-004 — Reise als Entwurf.** Beim Eintragen und im Reise-Fenster schaltet „Entwurf“ eine Reise
auf „noch in Planung“. Ein Entwurf ist im Kalender, in „Reisen“ und auf der Übersicht schraffiert
und trägt „Entwurf“; er wirkt noch nicht: wer mitfährt, bekommt weiter Nachrichten, und Aufgaben
warten nicht (Spec 0026); es gibt keine Pack-Karte auf der Übersicht und keine Zeile „unterwegs“.
Wird „Entwurf“ ausgeschaltet und gespeichert, wirkt die Reise ab dann wie jede Reise (REQ-008).
Quelle: Review 0002, Punkt 4 (Urlaubsplanung). Offline: offline lesend (Umschalten braucht Netz).

- AC-012: Angenommen „Reise eintragen“ für Nadja vom 12. bis 19.12. · Wenn ich „Entwurf“ einschalte
  und speichere · Dann ist sie gespeichert („Entwurf gespeichert“) und ihr Streifen ist schraffiert.
- AC-013: Angenommen Nadjas Entwurf 12.–19.12. · Dann bleibt ihre Aufgabe „Bad putzen“ am 15.12. am
  15.12., ihr Tagesüberblick am 14.12. kommt, und die Übersicht zeigt am 14.12. keine Zeile
  „Nadja ist unterwegs …“ und keine Pack-Karte.
- AC-014: Angenommen Nadjas Entwurf 12.–19.12. · Wenn ich im Reise-Fenster „Entwurf“ ausschalte und
  speichere · Dann steht „Reise bestätigt“, der Streifen ist voll, „Bad putzen“ wartet bis nach der
  Reise, und es kommt kein Fenster zu Gerichten.
- AC-015: Angenommen eine bestätigte Reise · Wenn ich „Entwurf“ einschalte und speichere · Dann
  wirkt sie nicht mehr (Aufgaben stehen wieder an ihrem Termin, Nachrichten kommen wieder).
- AC-016 (Rand): Angenommen offline · Dann ist „Entwurf“ ausgegraut mit dem Offline-Hinweis.
- AC-017 (Fehler): Angenommen ein Mitglied eines anderen Haushalts · Wenn es `draft` an unserer Reise
  ändern will · Dann ändert sich nichts (RLS).
- AC-018: Angenommen nur Entwürfe decken den 14.12. · Dann ist der Tag in der Jahresansicht
  schraffiert statt gefüllt, und in „Reisen“ trägt die Zeile „Entwurf“ und eine schraffierte Kachel.

### Fenster

**REQ-005 — Gleich breite Tage in „Einplanen“.** Die sieben Tages-Chips im Fenster „Einplanen“
(Rezept, Restaurant, Aktivität) teilen sich die ganze Breite zu gleichen Teilen, sodass beim
Blättern der Woche nichts springt. Quelle: Review 0002, Punkt 5 und Bildschirmfoto. Offline:
offline lesend (wie das Fenster).

- AC-019: Angenommen „Einplanen“ für „Brooklyn Burger Bar“ auf dem Handy (390 px), KW 6 · Dann füllen
  „Mo 8.2.“ bis „So 14.2.“ die Zeile in sieben gleich breiten Chips · Wenn ich zu KW 7 blättere · Dann
  steht „Mo 15.2.“ genau dort, wo „Mo 8.2.“ stand.
- AC-020 (Rand): Angenommen Desktop · Dann füllen die sieben Chips ebenso die Breite des Fensters.

**REQ-006 — Reihenfolge der Tabs im Hinzufügen-Fenster.** Die Tabs des Hinzufügen-Fensters im
Kalender lauten „Alle, Rezepte, Restaurants, Aktivitäten, Sammlungen, Reste“. Quelle: Review 0002,
Punkt 6. Offline: offline lesend.

- AC-021: Angenommen Kalender, Mo 23.11. Vormittag · Wenn ich „+“ wähle · Dann stehen die Tabs in der
  Reihenfolge „Alle, Rezepte, Restaurants, Aktivitäten, Sammlungen, Reste“.
- AC-022 (Rand): Angenommen das Fenster ohne Tag („vormerken“) · Dann fehlt „Reste“, die übrigen
  stehen in derselben Reihenfolge.

### Handy

**REQ-007 — Wischen zwischen Tabs greift auf dem iPhone.** Unter Haushalt und Essen (und Märkte &
Bereiche) wechselt ein Wisch auf dem Handy den Tab wie in Spec 0029, REQ-003 beschrieben, auch wenn
die Liste länger als der Bildschirm ist. Quelle: Enricos Rückmeldung zu Spec 0029. Offline: offline
vollständig.

- AC-023: Angenommen Handy, Haushalt „Anstehend“ mit einer Liste länger als der Bildschirm · Wenn ich
  waagrecht nach links wische · Dann folgt die Liste dem Finger, „Alle“ ist gewählt und die Adresse
  ist `/haushalt?ansicht=alle`.
- AC-024: Angenommen Handy, Essen „Rezepte“, etwas nach unten gescrollt · Wenn ich nach links wische ·
  Dann ist „Restaurants“ gewählt.
- AC-025 (Rand): Angenommen Handy, Haushalt · Wenn ich überwiegend senkrecht ziehe · Dann scrollt die
  Liste und der Tab bleibt; eine Zeile wischen bleibt Zeile wischen (Spec 0029, AC-012).

### Reisen und Essen

**REQ-008 — Reisen wirken nur auf Haushaltsaufgaben.** Eine Reise ändert nichts an Essen, Essern,
Restaurants, Aktivitäten und Einkauf: nach dem Speichern kommt keine Frage nach den geplanten
Gerichten mehr (K-02 entfällt), „Wer isst mit?“ wählt im Fenster „Einplanen“ und im
Hinzufügen-Fenster immer den ganzen Haushalt vor, und der Hinweis nach dem Verschieben eines
Eintrags nennt keine Reisenden mehr. Für Haushaltsaufgaben gelten die Regeln aus Spec 0026 weiter,
Nachrichten bleiben während einer Reise still (Spec 0022, AC-045). Der Satz unter „Wer?“ lautet
„Wer weg ist, bekommt keine Nachrichten und wird bei Aufgaben übersprungen. Was niemand erledigen
kann, wartet bis danach.“ Quelle: Enrico, 23.11.2026 („auf Reisen kann ich auch kochen, essen
gehen, Aktivitäten machen“). Offline: offline lesend.

- AC-026: Angenommen „Lasagne“ am Mo 30.11. Abend für Enrico und Nadja · Wenn ich „Dienstreise
  Hamburg“ für Enrico vom 30.11. bis 2.12. speichere · Dann schließt das Fenster ohne Frage nach den
  Gerichten · Und „Lasagne“ hat weiter Enrico und Nadja und 2 Portionen, die Einkaufsliste bleibt.
- AC-027: Angenommen Nadja ist vom 27. bis 29.11. auf Reise · Wenn ich „Lasagne“ einplane und Sa
  28.11. wähle · Dann sind bei „Wer isst mit?“ Enrico und Nadja gewählt; ebenso im
  Hinzufügen-Fenster des Kalenders am 28.11.
- AC-028: Angenommen bei „Lasagne“ essen Enrico und Nadja, Nadja ist vom 27. bis 29.11. auf Reise ·
  Wenn ich „Lasagne“ auf Fr 27.11. abends ziehe · Dann lautet der Hinweis „Lasagne → Fr 27.11.,
  Abend“.
- AC-029: Angenommen Nadja ist auf Reise und ihre Aufgabe „Bad putzen“ fällt in die Reise · Dann
  wartet sie wie bisher bis nach der Reise (Spec 0026, unverändert).
- AC-030: Angenommen ich öffne „Reise eintragen“ · Dann steht unter „Wer?“ der neue Satz, „Wer isst
  mit?“ kommt darin nicht vor.

**Ersetzt** (gilt nicht mehr): Spec 0008 AC-036 (erster Teil: Abwesende nicht vorausgewählt);
Spec 0010 AC-033 und AC-034 (je die Zeile zu „Wer isst mit?“); Spec 0016 AC-016 (Zusatz „· Nadja
ist dann auf Reise“); Spec 0022 REQ-007 und REQ-008 mit AC-021 bis AC-027 (Reisende aus geplanten
Gerichten nehmen); Spec 0023 AC-056 (eine neue Reise ändert die Vorauswahl; AC-055 gilt für
Mitglieder weiter); Spec 0026 REQ-015/AC-058 (der Satz, siehe oben).

## Entscheidungen

Alle von Claude nach Enricos Regel „Empfehlung nehmen“ (23.11.2026).

1. Kopfzeilen bleiben mit `position: sticky` (nur Web; die App ist eine Web-App, Spec 0015 ruht)
   oben am Scrollbereich, auf Seitenfarbe (der heutige Tag auf seiner Tönung). Auf dem Handy beginnt
   der Scrollbereich unter der schmalen Leiste (Spec 0005), dort bleiben sie stehen.
2. Ausgeschriebene Wochentage nur am Desktop (ab 1100 px); auf dem Tablet ist eine Spalte für
   „Donnerstag“ zu schmal.
3. Beim Ziehen einer Reise zeichnet die Hervorhebung über dem Tag nur noch den Rahmen; die Tönung
   kommt von der Markierung unter dem Inhalt (`RangeMark`). Grund für den Fehler: Die Hervorhebung
   liegt über dem Inhalt und war mit `accentSoft` deckend gefüllt. Beim Ziehen eines Eintrags bleibt
   sie, wie sie ist.
4. Eine Reise gehört zum Monat ihres Beginns, in der Gliederung und im Filter (AC-009): eine
   Regel, keine doppelten Zeilen. Der Filter ist ein Menü „Zeitraum“ mit „Alle Zeiträume“, je Jahr
   mit Reisen das Jahr und darunter dessen Monate mit Reisen, neueste zuerst. Der Monatsname über der
   Gruppe hat immer das Jahr, weil beide Abschnitte Jahre mischen.
5. Entwurf-Regel: Ein Entwurf wirkt nicht — er zählt nirgends als „weg“ (core `isOnTrip`, Server
   `private.is_silent`, `chore_can_do_on`, `chore_first_free_day`), schaltet also weder Aufgaben
   noch Nachrichten; die Übersicht zeigt für ihn keine Zeile „unterwegs“ und keine Pack-Karte.
   Bestätigen schaltet das alles ein, ohne weitere Frage. Sichtbar bleibt er überall, wo Reisen
   stehen (Kalender, Übersicht-Streifen, „Reisen“, Reisetaschen), schraffiert und mit „Entwurf“.
   Eine Packliste darf er haben.
6. Schraffur: diagonale Streifen in der Farbe des Streifens über der zarten Fläche (Web:
   `repeating-linear-gradient`), dünne Linien (Woche auf dem Handy, Monat) gestrichelt; keine neue
   Farbe.
7. Gleich breite Chips (`ChoiceChips` mit `fill`) nur in „Einplanen“: Nur dort wechseln die
   Beschriftungen beim Blättern. Die Datums-Chips der Aufgaben laufen in einer scrollbaren Reihe ohne
   Blättern, die Tageszeit-Chips haben feste Namen; gleich breit würde dort nur Platz kosten.
8. Ursache Wischen (REQ-007): Die Liste ist ein eigener Scrollbereich. Ohne `touch-action` übernimmt
   iOS jede Bewegung als natives Scrollen; schon ein Pixel senkrecht macht die `ScrollView` von
   react-native-web zum Responder, und sie gibt ihn nach beobachtetem Scrollen nicht mehr ab
   (`scrollResponderHandleTerminationRequest`). Der Tab-Wisch (nur in der Bubble-Phase) kam so nie
   an. `touch-action` an einem Vorfahren hilft nicht, weil Scrollbereiche sie zurücksetzen. Lösung:
   Der Scrollbereich der Seite (Screen und `InfiniteList`) bekommt bei aktivem Tab-Wisch
   `touch-action: pan-y`, sodass iOS seitliche Bewegungen nicht mehr scrollt; der Tab-Wisch gibt den
   Finger nach dem Übernehmen nicht wieder ab. So arbeitet schon das Blättern im Kalender
   (`SwipeArea`). Prüfen kann es nur das iPhone (Chromium zeigt den Fehler nicht).
9. `CACHE_VERSION` steigt, weil die gespeicherten Reisen ein neues Feld haben.
10. Reisen und Essen (REQ-008): Die Reise schaltet weiter Nachrichten still (`private.is_silent`
    unverändert bis auf Entwürfe), auch den Tagesüberblick mit Essen; Enrico nannte nur Essen,
    Esser, Restaurants, Aktivitäten und Einkauf. Die Zeile „Nadja unterwegs“ im Vorlesetext eines
    Kalendertags bleibt, weil sie die Reise zeigt und nichts ändert. `refreshPlanEaters` bleibt für
    Mitglieder, die nach dem Öffnen ankommen (Spec 0023, AC-055).
11. Entfällt im Code: `packages/core/src/trip-meals.ts` mit Tests, `takeTravellersOut`
    (`packages/api`), `TripMealsDialog`, der Parameter `trips` von `defaultEaters`/`eatersForDay`/
    `defaultPlanChoice`/`withPlanDay`/`pagePlanChoice`/`refreshPlanEaters` und `travellerNames` von
    `moveToastText`. Eine eigene Datenbank-Funktion hatte das Rausnehmen nicht (es lief über
    `apply_changes` und `replace_entry_contributions`, die bleiben), also entfällt in der Datenbank
    nichts.

## Daten

`trips.draft boolean not null default false` (Insert und Update erlaubt, in der Positivliste von
`apply_changes`). `private.is_silent`, `private.chore_can_do_on` und `private.chore_first_free_day`
übergehen Entwürfe. Keine personenbezogenen Daten. Adresse: `reisen.zeitraum`.
Entfällt in der Datenbank: nichts (Entscheidung 11).

## Risiken

| Risiko                                                      | Gegenmaßnahme                             | Test                                                 |
| ----------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| Fremder Haushalt setzt `draft` an unserer Reise             | bestehende RLS auf `trips`                | pgTAP `trip_drafts.test.sql`                         |
| Abgemeldet ändert `draft`                                   | kein Grant an `anon`                      | pgTAP `trip_drafts.test.sql`                         |
| Entwurf schaltet Nachrichten stumm oder verschiebt Aufgaben | Server und core übergehen Entwürfe gleich | pgTAP `trip_drafts.test.sql`, Vitest `trips.test.ts` |
| `apply_changes` verliert eine Spalte der Positivliste       | Positivliste nur um `draft` erweitert     | pgTAP `trip_drafts.test.sql` (Insert und Update)     |

## Umsetzung

- [x] 1. Spec, Glossar „Reise-Entwurf“, Eintrag in `docs/specs/README.md`.
- [ ] 2. Tabs im Hinzufügen-Fenster neu sortiert (AC-021, AC-022).
- [ ] 3. `ChoiceChips` mit `fill`; „Einplanen“ nutzt es (AC-019, AC-020).
- [ ] 4. Hervorhebung beim Ziehen einer Reise nur als Rahmen (AC-005, AC-006).
- [ ] 5. Kopfzeilen sticky, Wochentage am Desktop ausgeschrieben (AC-001–AC-004).
- [ ] 6. Tab-Wisch: `touch-action: pan-y` am Scrollbereich, Finger nicht abgeben (AC-023–AC-025).
- [ ] 7. Migration `trips.draft`, Server-Regeln, pgTAP; Typen, Seeds, Cache, core-Regeln mit Tests
      (AC-013, AC-015, AC-017).
- [ ] 8. Entwurf im Fenster „Reise eintragen“ und im Reise-Fenster, Schraffur in Kalender, Jahr,
      „Reisen“ (AC-012, AC-014, AC-016, AC-018).
- [ ] 9. „Reisen“ nach Monaten mit Filter „Zeitraum“ (AC-007–AC-011).
- [ ] 10. Reisen wirken nur auf Aufgaben: K-02 und Rausnehmen entfernt, Vorauswahl „Wer isst mit?“
      ohne Reisen, Hinweis beim Verschieben ohne Reisende, Satz unter „Wer?“ (AC-026–AC-030).
- [ ] 11. e2e-Tests (nur typgeprüft) in `e2e/rundgang-review-0002.spec.ts`; alte e2e-Tests zu K-02
      und zur Vorauswahl angepasst.
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün, DB-Tests über das
      Schloss grün, `pnpm e2e:dev` grün, e2e-Typprüfung grün. Offen: Wischen auf dem iPhone prüft
      Enrico (Entscheidung 8).
