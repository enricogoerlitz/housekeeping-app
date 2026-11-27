---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-22
---

# 0026 — Haushaltsaufgaben: Termine, Später, Nachtragen und Reisen

**Quelle:** ER-32, ER-33 (`docs/product/review-enrico-2026-11-22.md`); H-01–H-06, H-08–H-10, U-04
(`docs/product/review-logik-und-bedienung.md`, H-03 von Enrico einzeln entschieden); Enricos Frage
vom 22.11.2026 zu „fällig seit“.

**Kritischer Pfad:** ja — Migration (`complete_chore`, neue Domänen-Operation zum Ändern des Tags
einer Erledigung), Zeitplaner mit Reise-Regel in SQL und `packages/core` (Parität, ADR-0014),
Tenancy der neuen und geänderten Funktionen.

Beispiele: heute ist **So 22.11.2026**; Haushalt „Enrico & Nadja“ (E, N, in dieser Reihenfolge);
„Urlaub Mallorca“ Fr 4.12.–Do 10.12.2026 für beide (= ganzer Haushalt); „Dienstreise Hamburg“ Fr
18.12.–Sa 19.12.2026 nur Enrico.

## Ziel

Den nächsten Termin einer Aufgabe sieht und setzt man selbst, „Einmalig“ und „Später“ nehmen jeden
Tag, Nachtragen geht 30 Tage zurück, und der Verlauf lässt sich filtern. Fälliges heißt überall
gleich, die Punkte für heute sind überall dieselbe Zahl. Reisen wirken auf Aufgaben: Ist niemand da,
der eine Aufgabe erledigen kann, wartet ihr Termin bis zum ersten Tag danach; bei „Abwechselnd“
übernimmt, wer zu Hause ist; während einer Reise des ganzen Haushalts bleibt „Zu tun“ leer und es
kommt keine Erinnerung — in App und Zeitplaner gleich gerechnet.

## Nicht-Ziele

- Keine gespeicherte Verschiebung durch Reisen: abgeleitet, eine geänderte Reise wirkt sofort.
- Kein Nachholen oder Gutschreiben von Runden, keine Fairness-Statistik.
- Keine Pause der flexiblen Uhr während einer Reise.
- Reisen selbst anlegen, ändern und zeigen ist Spec 0022; Adress-Parameter sind Spec 0019.

## Schon erledigt

- H-07 („Abwechselnd“ zeigt nur, wer dran ist): Spec 0018, REQ-006; `choreMemberIds` in
  `packages/core/src/chores.ts`.
- Nicht erledigte Aufgaben bleiben an den Folgetagen sichtbar: `dueChores`
  (`packages/core/src/overview.ts`) nimmt Überfälliges zuerst, Haushalt hat einen Abschnitt dafür,
  die Haushalt-Zeile zeigt es heute (Spec 0010, AC-017). Nur die Texte weichen ab (REQ-009).
- ER-32: Den Link gibt es nur in `apps/app/src/features/chores/chores-screen.tsx` („Anstehend“),
  nirgends sonst.

## Anforderungen

### Termine und Bedienung

**REQ-001 — „Einmalig“ an jedem Tag ab heute.** Die Datums-Chips sind „Ohne Datum“, „Datum …“
(Monatskalender `MonthCalendar` aus Spec 0016, Tage vor heute gesperrt, unter den Chips
aufgeklappt), dann die Kurzwahl der nächsten 14 Tage; ein Tag aus dem Kalender steht auf dem Chip.
Quelle: ER-33, H-02. Offline: nur online (Speichern ausgegraut mit Offline-Hinweis).

- AC-001: Angenommen „Neue Aufgabe“, Rhythmus „Einmalig“ · Dann Chips „Ohne Datum“, „Datum …“,
  „heute“, „morgen“, „Di 24.11.“ … „Sa 5.12.“ · Wenn „Datum …“, › bis „März 2027“, der 16. · Dann
  heißt der Chip „Di 16.3.2027“ und ist gewählt; gespeichert als „TÜV“ zeigt die Aufgabe „Nächstes
  Mal Di 16.3.2027“.
- AC-002: Angenommen über „Datum …“ ist Sa 19.12. gewählt · Wenn ich „morgen“ antippe · Dann ist
  „morgen“ gewählt und der Chip heißt wieder „Datum …“ · Und „Winterreifen“ (Sa 23.1.2027) zeigt
  beim Bearbeiten den Chip „Sa 23.1.2027“ gewählt, der Kalender öffnet im Januar 2027.
- AC-003: Angenommen der Kalender zeigt November 2026 · Dann sind der 1.–21. nicht wählbar, die
  Pfeiltaste links vom 22. bleibt auf dem 22.

**REQ-002 — „Nächstes Mal“ einstellen, „Zuletzt erledigt“ beim Anlegen.** Bei Wöchentlich,
Monatlich, Alle n Monate und Flexibel zeigt das Formular „Nächstes Mal“ (Flexibel: „Nächstes Mal
etwa“) mit den Chips aus REQ-001 ohne „Ohne Datum“, vorausgewählt der Vorschlag; beim Anlegen gibt es
„Zuletzt erledigt (optional)“ (Tag bis heute, ohne Grenze zurück). Vorschlag: Wöchentlich nächster
gewählter Wochentag ab heute; Monatlich der Tag in diesem oder im nächsten Monat; Alle n Monate und
Flexibel ab „Zuletzt erledigt“, sonst **ab heute plus Intervall** — nie vor heute. Ändert man den
Rhythmus, rückt der Vorschlag im Formular mit, solange man den Tag nicht selbst gewählt hat.
„Zuletzt erledigt“ legt keinen Verlaufseintrag an; die Aufgabe zeigt ihn ohne Avatar. Quelle: H-01.
Offline: nur online.

- AC-004: Angenommen „Matratze drehen“, Alle 6 Monate · Wenn „Zuletzt erledigt“ = Sa 15.8.2026 ·
  Dann ist „Mo 15.2.2027“ gewählt; gespeichert steht sie nicht unter „Zu tun“, zeigt „Nächstes Mal
  Mo 15.2.2027“ und „Zuletzt Sa 15.8.“, der Verlauf hat keinen Eintrag.
- AC-005: Angenommen neu „Fenster Wohnzimmer“, Alle 2 Monate, ohne „Zuletzt erledigt“ · Dann ist
  „Fr 22.1.2027“ gewählt · Und neu „Bettwäsche wechseln“, etwa alle 14 Tage · Dann „So 6.12.“,
  gespeichert unter „Flexibel“ mit leerem Balken, nicht unter „Zu tun“.
- AC-006: Angenommen „Bad putzen“ (wöchentlich Fr) wurde versehentlich von Fr 27.11. auf Sa 28.11.
  verschoben, der Hinweis ist weg · Wenn „Bearbeiten ›“, „Nächstes Mal“ = „Fr 27.11.“, speichern ·
  Dann zeigt sie „Nächstes Mal Fr 27.11.“, auch auf Nadjas Gerät.
- AC-007: Angenommen „Bad putzen“ wöchentlich Fr, zuletzt Fr 20.11. · Wenn ich „Mo“ statt „Fr“ wähle
  · Dann springt „Nächstes Mal“ vor dem Speichern auf „morgen“ · Wenn ich danach selbst „Mi 25.11.“
  und zusätzlich „Do“ wähle · Dann bleibt „Mi 25.11.“ und wird gespeichert.
- AC-008: Angenommen Formular mit „Alle n Monate“ · Dann sind unter „Zuletzt erledigt“ Tage nach
  heute, unter „Nächstes Mal“ Tage vor heute gesperrt · Und bei „Bei Bedarf“ und „Einmalig“ fehlen
  beide Felder.

**REQ-003 — „Als Nächstes dran“.** Bei „Abwechselnd“ steht unter der Zuständigkeit „Als Nächstes
dran“ mit einem Chip je Person; gewählt ist die Person, die regulär dran ist (neu: die erste der
Reihenfolge). Quelle: H-08. Offline: nur online.

- AC-009: Angenommen „Bad putzen“ abwechselnd, dran Nadja · Wenn Nadja „Bearbeiten ›“ → „Als
  Nächstes dran“ = „Enrico“ speichert · Dann zeigt die Zeile Enricos Avatar (auch auf Enricos Gerät)
  und die Aufgabe „abwechselnd, dran: Enrico“.
- AC-010: Angenommen das Formular aus AC-009 · Wenn „Fest“, dann wieder „Abwechselnd“ · Dann fehlt
  die Zeile bei „Fest“ und zeigt danach wieder „Nadja“ gewählt.

**REQ-004 — „Bei Bedarf“ startet mit „Egal“, nicht passende Knöpfe fehlen.** Wählt man beim Anlegen
„Bei Bedarf“, wird die Zuständigkeit „Egal“, solange man sie nicht selbst gewählt hat. In der
geöffneten Aufgabe fehlen „Später“ und „Überspringen“ bei „Bei Bedarf“ und „Überspringen“ bei
„Einmalig“ ganz. Quelle: H-09. Offline: vorhandene Knöpfe ausgegraut mit Offline-Hinweis.

- AC-011: Angenommen „Neue Aufgabe“ steht auf „Abwechselnd“ · Wenn „Bei Bedarf“ · Dann „Egal“ ·
  Und hatte ich vorher „Fest“ + „Nadja“ gewählt, bleibt das.
- AC-012: Angenommen „Fenster Küche“ (bei Bedarf) · Wenn geöffnet · Dann „Erledigt“, „Bearbeiten ›“,
  „Alle Einträge ›“, „Löschen“, kein „Später“/„Überspringen“ · Und „Glühbirne Flur tauschen“
  (einmalig) hat „Später“, kein „Überspringen“ · Und offline sind bei „Bad putzen“ alle drei Knöpfe
  da und ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“.

**REQ-005 — „Später“ mit Auswahl.** „Später“ öffnet ein Menü; erst ein Eintrag verschiebt den
nächsten Termin, Rhythmus, „Zuletzt“ und Zuständigkeit bleiben, kein Verlaufseintrag. Ausgangstag ist
der spätere von heute und dem Termin nach REQ-011. Einträge: +1 und +2 Tage („Morgen · Mo 23.11.“,
„Übermorgen · Di 24.11.“, bei künftigem Ausgangstag „Einen Tag später · …“, „Zwei Tage später ·
…“), „Am Wochenende · Sa 28.11.“ (erster Sa/So nach dem Ausgangstag, fehlt bei Dopplung), „Datum …“
(ab heute). Hinweis „Verschoben auf Di 24.11.“ mit 5 s „Rückgängig“. Quelle: H-05. Offline: nur
online, „Später“ ausgegraut.

- AC-013: Angenommen „Müll rausbringen“ (wöchentlich So) ist heute dran · Wenn „Später“ · Dann Menü
  „Morgen · Mo 23.11.“, „Übermorgen · Di 24.11.“, „Am Wochenende · Sa 28.11.“, „Datum …“, Termin
  unverändert · Wenn „Übermorgen“ · Dann „Nächstes Mal Di 24.11.“, nicht mehr unter „Zu tun“, Hinweis
  mit „Rückgängig“ stellt heute wieder her.
- AC-014: Angenommen das Menü ist offen · Wenn Escape oder Tipp daneben · Dann bleibt der Termin, kein
  Hinweis.
- AC-015: Angenommen „Bad putzen“ nächstes Mal Fr 27.11. · Wenn „Später“ · Dann „Einen Tag später ·
  Sa 28.11.“, „Zwei Tage später · So 29.11.“, „Datum …“, kein „Am Wochenende“ · Wenn „Datum …“ → Mi
  25.11. · Dann „Nächstes Mal Mi 25.11.“, Rhythmus weiter „wöchentlich Fr“.

**REQ-006 — „Anstehend“ mit „Ohne Termin“, ohne „weitere später“.** Nach „Diese Woche“ steht
„Ohne Termin“ mit einmaligen Aufgaben ohne Datum; der Link „n weitere Aufgaben später – alle
ansehen“ entfällt, Späteres und Pausiertes steht nur unter dem Tab „Alle“. Quelle: H-04, ER-32.
Offline: offline vollständig (Anzeige).

- AC-016: Angenommen „Glühbirne Flur tauschen“ einmalig ohne Datum · Dann steht sie unter „Ohne
  Termin“ mit Haken · Wenn abgehakt und 2 s gewartet · Dann im Verlauf, unter „Alle“ weg; unter „Zu
  tun“ stand sie nie.
- AC-017: Angenommen „Matratze drehen“ erst Fr 1.1.2027, „Rasen mähen“ pausiert · Dann fehlen beide
  unter „Anstehend“ und nirgends steht „weitere Aufgaben später“ · Und unter „Alle“ stehen sie mit
  „nächstes Mal Fr 1.1.2027“ bzw. „pausiert“.
- AC-018: Angenommen nichts fällig, nichts ohne Termin · Dann „Alles erledigt“ mit „Für diese Woche
  steht nichts mehr an. Alles Weitere steht unter „Alle“.“

**REQ-007 — Nachtragen bis 30 Tage, Tag im Verlauf ändern.** In „Was anderes erledigt?“ bietet der
Tag „heute“, „gestern“, „vorgestern“, „Datum …“ (heute − 30 bis heute); ein Verlaufseintrag hat
„Datum ändern“ mit derselben Grenze. Bei der jüngsten (zuletzt gebuchten) Erledigung einer
bestehenden Aufgabe rechnen Termin und „Zuletzt“ vom gemerkten Stand davor neu; sonst ändert sich nur
der Tag. Der Server nimmt heute − 31 bis + 1 an (Zeitzonen-Puffer). Quelle: H-06. Offline: nur online,
Suchen und Ansehen offline.

- AC-019: Angenommen „Fenster Wohnzimmer“ (alle 2 Monate) nächstes Mal Fr 20.11. · Wenn „Datum …“ →
  Sa 14.11. → „Als erledigt eintragen“ · Dann Verlauf KW 46 „Sa 14.“ mit Enricos Avatar, Aufgabe
  „Nächstes Mal Mi 20.1.2027“, „Zuletzt Sa 14.11. (E)“.
- AC-020: Angenommen „Datum …“ zeigt Oktober 2026 · Dann ist Fr 23.10. wählbar, Do 22.10. und
  davor sowie Tage nach heute nicht · Und ein API-Aufruf mit Tag 20.10.2026 wird mit
  „invalid_change“ abgelehnt.
- AC-021: Angenommen „Bettwäsche wechseln“ (etwa 14 Tage), jüngster Eintrag „Fr 20.11. (N)“, nächstes
  Mal etwa Fr 4.12. · Wenn „Datum ändern“ → Mi 18.11. · Dann Eintrag „Mi 18.“, Aufgabe „Nächstes Mal
  etwa Mi 2.12.“, „Zuletzt Mi 18.11. (N)“.
- AC-022: Angenommen „Bad putzen“ hat „Fr 20.11. (E)“ (jüngster) und „Fr 13.11. (N)“ · Wenn der
  ältere auf Do 12.11. geändert wird · Dann nur sein Tag ändert sich, „Nächstes Mal Fr 27.11.“ bleibt.
- AC-023: Angenommen Nadja hat den Eintrag entfernt, während Enrico ihn offen hat · Wenn Enrico das
  Datum ändert · Dann „Hat nicht geklappt – bitte noch einmal versuchen“, Eintrag bleibt weg · Und
  fremder Haushalt oder abgemeldet über die API: abgelehnt · Und offline „Datum ändern“ ausgegraut.

**REQ-008 — Verlauf filtern.** Über dem Verlauf: „Alle“, je Mitglied ein Chip, und „Aufgabe ▾“;
beide wirken zusammen, gefiltert wird nach der Aufgabe (Einträge gelöschter Aufgaben nur ohne
Aufgaben-Filter). Die Aufgabe hat „Alle Einträge ›“, das den Verlauf mit ihr gefiltert öffnet.
Filter stehen nach Spec 0019 in der Adresse. Quelle: H-10. Offline: offline vollständig.

- AC-024: Angenommen Einträge von Enrico und Nadja · Wenn „Nadja“ · Dann nur Einträge mit Nadjas
  Avatar, weiter nach Monat und Woche gegliedert.
- AC-025: Angenommen „Bad putzen“ hat 6 Einträge · Wenn „Alle Einträge ›“ · Dann zeigt „Verlauf“ nur
  diese 6 mit dem Chip „Bad putzen ✕“, auch nach Neuladen; ✕ hebt den Filter auf.
- AC-026: Angenommen Nadja hat „Fenster Küche“ nie erledigt · Wenn „Nadja“ + „Fenster Küche“ · Dann
  „Keine Einträge für diese Auswahl“ mit „Filter zurücksetzen“, der beide Filter aufhebt.

### Texte und Punkte

**REQ-009 — Eine Formulierung für Fälliges.** Übersicht, Haushalt und Tagesüberblick sagen gleich:
„heute“, „fällig seit gestern“, „fällig seit n Tagen“ (ab 2), nach einer Reise am Tag selbst „heute,
nach der Reise“, vorher „nach der Reise am Fr 11.12.“; Flexibel „jetzt fällig“ bzw. „bald fällig“
(ab 80 %), im Haushalt darunter weiter „n % bis fällig“. „Überfällig“ und „fällig seit 1 Tag“
entfallen; der Haushalt-Abschnitt „Fällig seit“ heißt „Noch offen“. Gezählt wird ab dem Termin nach
REQ-011. Quelle: Enricos Frage, U-04. Offline: offline vollständig.

- AC-027: Angenommen „Fenster Wohnzimmer“ war Sa 21.11., „Müll rausbringen“ Do 19.11., „Bad putzen“
  ist heute dran, nichts erledigt · Dann auf Übersicht und in „Anstehend“: „fällig seit gestern“,
  „fällig seit 3 Tagen“, „heute“; die ersten beiden im Abschnitt „Noch offen“; nirgends „überfällig“.
- AC-028: Angenommen „Bad putzen“ war Fr 20.11. dran, nicht erledigt · Dann Sa 21.11. „fällig seit
  gestern“, So 22.11. „fällig seit 2 Tagen“ unter „Zu tun“ · Und die Haushalt-Zeile zeigt sie nur
  heute.
- AC-029: Angenommen der Fall aus AC-027, Enrico zuständig, Tagesüberblick „Aufgaben“ 7:30 · Dann
  „Heute: Fenster Wohnzimmer (du, fällig seit gestern) · Müll rausbringen (du, fällig seit 3 Tagen) ·
  Bad putzen (du)“.
- AC-030: Angenommen „Pflanzen gießen“ (etwa 10 Tage) seit 12, „Bettwäsche“ (etwa 10 Tage) seit 8
  Tagen · Dann „jetzt fällig“ bzw. „bald fällig“ an beiden Stellen, kein „fällig seit“.

**REQ-010 — Dieselben Punkte für heute.** Eine Rechnung: Summe des Aufwands aller Aufgaben unter
„Zu tun“ heute (`dueChores` mit REQ-011); auf der Übersicht neben „Zu tun“ „ca. 5 Punkte“, im
Haushalt über den Abschnitten „Zu tun heute: ca. 5 Punkte“; am Abschnitt „Heute“ keine Zahl mehr.
Quelle: U-04. Offline: offline vollständig.

- AC-031: Angenommen heute „Bad putzen“ (2), noch offen „Fenster Wohnzimmer“ (2) und „Müll
  rausbringen“ (1) · Dann Übersicht „ca. 5 Punkte“, Haushalt „Zu tun heute: ca. 5 Punkte“.
- AC-032: Angenommen nur „Müll rausbringen“ (1) · Dann „ca. 1 Punkt“ bzw. „Zu tun heute: ca. 1
  Punkt“ · Wenn abgehakt und gebucht · Dann nirgends Punkte.

### Reisen wirken auf Aufgaben

Begriffe: Eine Person **ist weg**, wenn sie an diesem Tag auf einer Reise des Haushalts steht
(Spec 0022: `trips` + `trip_members`; Von und Bis zählen). Der **ganze Haushalt ist weg**, wenn jedes Mitglied weg
ist, egal über welche Reisen. Ein Tag ist für eine Aufgabe **frei**, wenn jemand da ist, der sie
erledigen kann:

| Zuständigkeit | kann erledigen           | Termin wartet, wenn …           |
| ------------- | ------------------------ | ------------------------------- |
| Fest          | die feste Person         | sie weg ist                     |
| Abwechselnd   | jede Person der Reihe    | alle der Reihe weg sind         |
| Egal          | jedes Mitglied           | der ganze Haushalt weg ist      |
| Zu zweit      | alle Mitglieder zusammen | mindestens ein Mitglied weg ist |

**REQ-011 — Ein Termin wartet bis zum ersten freien Tag.** Für Rhythmen mit Termin (Einmalig mit
Datum, Wöchentlich, Monatlich, Alle n Monate, Flexibel) gilt statt des gespeicherten Termins der erste
freie Tag ab ihm, auch über überlappende Reisen; an nicht freien Tagen ist eine Aufgabe nirgends
fällig (Zu tun, Noch offen, Haushalt-Zeile, Tagesüberblick, Punkte), auch wenn ihr Termin schon vor
der Reise lag (sie zählt danach ab diesem Termin). Gespeichert wird nichts. Aufgaben, die auf
denselben Tag rücken, stehen dort nach gespeichertem Termin, dann Titel; eine Aufgabe steht dort
einmal, auch wenn mehrere ihrer Termine in die Reise fielen. Die flexible Uhr läuft weiter. Saison
gilt für den neuen Tag. Erledigen während einer Reise ist erlaubt. Künftige Termine im Kalender
rücken genauso und werden je Aufgabe zusammengelegt. Nur Reisen des eigenen Haushalts zählen.
Quelle: H-03. Offline: offline lesend (aus dem lokalen Speicher berechnet).

- AC-033: Angenommen „Bad putzen“ (wöchentlich Fr, fest Nadja) Fr 4.12., „Fenster Wohnzimmer“ (alle 2
  Monate, fest Enrico) Mo 7.12. · Dann am Do 3.12. unter „Alle“ beide „nach der Reise am Fr 11.12.“,
  die Aufgabe „Nächstes Mal Fr 11.12. · nach der Reise“ · Und Sa 5.12. keine unter „Zu tun“ oder
  „Noch offen“ · Und Fr 11.12. unter „Heute“ „Bad putzen“, dann „Fenster Wohnzimmer“, je „heute, nach
  der Reise“; Sa 12.12. „fällig seit gestern“.
- AC-034: Angenommen „Staubsaugen“ (wöchentlich Mo, Do, egal) Mo 7.12. · Dann Fr 11.12. genau einmal
  unter „Zu tun“ · Wenn abgehakt · Dann nächstes Mal Mo 14.12.
- AC-035: Angenommen Dienstreise Hamburg; „Müll rausbringen“ (wöchentlich Sa, fest Enrico) Sa
  19.12., „Fenster putzen“ (monatlich am 19., zu zweit) Sa 19.12., „Blumen gießen“ (wöchentlich Fr,
  egal) Fr 18.12. · Dann die ersten beiden „nach der Reise am So 20.12.“, „Blumen gießen“ steht Fr
  18.12. mit „heute“ unter „Zu tun“.
- AC-036: Angenommen „Keller aufräumen“ (einmalig, fest Enrico) war Mo 30.11. dran, offen · Dann Sa
  5.12. nicht unter „Zu tun“, Fr 11.12. mit „fällig seit 11 Tagen“.
- AC-037: Angenommen „Pflanzen gießen“ (etwa 3 Tage, egal) zuletzt Do 3.12. · Dann So 6.12.–Do 10.12.
  nicht unter „Zu tun“, Fr 11.12. mit vollem Balken „jetzt fällig“ · Und die Haushalt-Zeile zeigt
  „Pflanzen gießen, etwa“ am 11.12., nicht am 6.12.
- AC-038: Angenommen „Paket abholen“ einmalig Sa 5.12., „Glühbirne Flur tauschen“ ohne Datum · Dann
  „Paket abholen“ „nach der Reise am Fr 11.12.“, „Glühbirne“ unverändert unter „Ohne Termin“.
- AC-039: Angenommen heute Fr 4.12., die Reise beginnt heute, „Bad putzen“ heute dran · Dann nicht
  unter „Zu tun“ · Wenn Nadja unter „Alle“ „Erledigt“ wählt · Dann Verlauf „Fr 4.“ (N), nächstes Mal
  Fr 11.12. mit „heute“ ohne „nach der Reise“.
- AC-040: Angenommen AC-033 am Do 3.12. · Wenn Enrico die Reise bis Sa 12.12. verlängert · Dann
  „nach der Reise am So 13.12.“ auf beiden Geräten · Wenn er sie löscht · Dann „nächstes Mal Fr 4.12.“;
  `next_due_on` war durchgehend 2026-12-04.
- AC-041: Angenommen zusätzlich „Messe“ Di 1.12.–Sa 5.12. nur Enrico; „Keller aufräumen“ (fest
  Enrico) und „Blumen gießen“ (egal) Mi 2.12. · Dann „Keller“ „nach der Reise am Fr 11.12.“,
  „Blumen gießen“ Mi 2.12. unter „Zu tun“ · Und zwei Einzelreisen E und N 4.–10.12. wirken wie eine
  des ganzen Haushalts.
- AC-042: Angenommen „Rasen mähen“ (wöchentlich Sa, April–September) Sa 25.9.2027, Reise aller 25.9.–
  3.10.2027 · Dann Mo 4.10.2027 nicht unter „Zu tun“, unter „Alle“ „pausiert“.
- AC-043: Angenommen „Müll rausbringen“ heute dran · Wenn „Später“ → „Datum …“ → Sa 5.12. · Dann
  Hinweis „Verschoben auf Sa 5.12. – wegen der Reise erst Fr 11.12.“.
- AC-044: Angenommen Enrico hat in „WG Berlin“ eine Reise 4.–10.12., in „Enrico & Nadja“ keine ·
  Dann stehen seine Aufgaben in „Enrico & Nadja“ am Sa 5.12. wie immer unter „Zu tun“.

**REQ-012 — „Abwechselnd“ überspringt, wer weg ist.** Ist am Termin (nach REQ-011) die Person weg,
die regulär dran ist, ist die nächste Person der Reihenfolge dran, die da ist; das zeigen Zeile,
Aufgabe („dran: Nadja (für Enrico, unterwegs)“) und Haushalt-Zeile schon vorher. Gespeichert bleibt
die reguläre Person; nach dem Erledigen geht es wie immer bei der Person nach der weiter, die erledigt
hat. Die Reihenfolge ändert sich nie, nichts wird nachgeholt. Quelle: H-03. Offline: offline lesend.

- AC-045: Angenommen „Bad putzen“ (wöchentlich Fr, abwechselnd E ↔ N) Fr 18.12., regulär Enrico ·
  Dann Mi 16.12. zeigt die Zeile Nadjas Avatar („dran: Nadja“), die Aufgabe „abwechselnd, dran: Nadja
  (für Enrico, unterwegs)“ · Wenn Nadja am 18.12. abhakt · Dann nächstes Mal Fr 25.12., dran Enrico.
- AC-046: Angenommen „WG Berlin“ mit Enrico, Nadja, Vera, dran Enrico, der am Termin weg ist · Dann
  Nadja; nach ihr Vera, dann Enrico · Und sind Enrico und Nadja weg, Vera.
- AC-047: Angenommen AC-045, Enrico hakt in Hamburg selbst ab · Dann Verlauf „Fr 18.“ (E), danach
  Nadja dran.
- AC-048: Angenommen AC-045 · Dann zeigt KW 51 am Fr 18.12. „○ Bad putzen (N)“ und KW 52 am Fr 25.12.
  „○ Bad putzen (E)“.

**REQ-013 — Anzeige während einer Reise des ganzen Haushalts.** An Tagen, an denen der ganze
Haushalt weg ist, zeigt „Zu tun“ auf der Übersicht (heute und an gewählten Tagen der Reise) statt der
Liste „Ihr seid unterwegs – Aufgaben warten bis Fr 11.12.“ (erster Tag danach), ohne Punkte;
„Was anderes erledigt?“ bleibt. „Anstehend“ zeigt denselben Satz statt „Zu tun heute“; die
Haushalt-Zeile im Kalender und im Tages-Fenster ist an diesen Tagen leer. Eine Reise einzelner
Personen bekommt keinen eigenen Satz. Quelle: H-03. Offline: offline lesend.

- AC-049: Angenommen heute Sa 5.12. · Dann Übersicht „Zu tun“: „Ihr seid unterwegs – Aufgaben warten
  bis Fr 11.12.“ und „Was anderes erledigt?“, keine Haken, keine Punkte · Und „Anstehend“ zeigt den
  Satz über den Abschnitten.
- AC-050: Angenommen heute So 22.11., ich wähle auf der Übersicht Mi 9.12. · Dann steht unter „Zu tun
  am Mittwoch“ derselbe Satz statt „Nichts geplant.“
- AC-051: Angenommen KW 49 und KW 50 im Kalender · Dann steht in der Haushalt-Zeile am 4.–10.12.
  nichts, am Fr 11.12. „Bad putzen“, „Fenster Wohnzimmer“ und weitere gerückte Aufgaben.
- AC-052: Angenommen nur Dienstreise Hamburg, heute Fr 18.12. · Dann kein Satz zur Reise unter „Zu
  tun“, die Aufgaben stehen wie in AC-035.

**REQ-014 — Benachrichtigungen nach derselben Regel.** Tagesüberblick und Erinnerung an Aufgaben mit
Uhrzeit (nur bei „Erinnern“ an, Spec 0027 REQ-009) nutzen den Termin nach REQ-011 und die
Vertretung nach REQ-012: an nicht freien Tagen nichts
zur Aufgabe, am neuen Tag zur Uhrzeit an die Person, die dann dran ist; wer weg ist, bekommt
weiterhin nichts (Spec 0013, AC-035). Zeitplaner (SQL) und `packages/core` rechnen dasselbe;
Paritätstests tragen die Namen der core-Tests. Quelle: H-03. Offline: entfällt (Server).

- AC-053: Angenommen „Müll rausbringen“ (egal, 19:00) Sa 5.12., beide haben „Aufgaben mit Uhrzeit“
  an · Dann am 4.–10.12. keine Nachricht · Und am Fr 11.12. um 19:00 beide „Müll rausbringen ·
  19:00“.
- AC-054: Angenommen AC-045 mit Uhrzeit 10:00 · Dann am Fr 18.12. um 10:00 bekommt Nadja „Bad putzen
  · 10:00 · du bist dran“, Enrico nichts · Und Nadjas Tagesüberblick nennt „Bad putzen (du, 10:00)“.
- AC-055: Angenommen „Müll rausbringen“ (fest Enrico, 19:00) Sa 19.12. · Dann am 19.12. niemand, am
  So 20.12. um 19:00 Enrico „Müll rausbringen · 19:00 · du bist dran“.
- AC-056: Angenommen die Aufgaben aus AC-033 bis AC-045 und beide Reisen · Wenn core und Zeitplaner
  für jeden Tag 1.12.–27.12. Fälligkeit, Zähltag und Person berechnen · Dann stimmen sie überein
  (pgTAP `notification_parity.test.sql`).
- AC-057: Angenommen ein zweiter Haushalt mit eigener Reise und Aufgaben · Dann beeinflusst keine
  seiner Reisen Fälligkeit oder Empfänger von „Enrico & Nadja“ und umgekehrt (pgTAP).

**REQ-015 — Satz zur Wirkung im Reise-Fenster.** Wo die App erklärt, was eine Reise bewirkt (unter „Wer?“ beim Anlegen im Reise-Fenster, Spec 0022 REQ-003), steht: „Wer weg ist, fehlt
bei „Wer isst mit?“, bekommt keine Nachrichten und wird bei Aufgaben übersprungen. Was niemand
erledigen kann, wartet bis danach.“ Quelle: H-03, Spec 0010 Offene Frage 1. Offline: Anzeige.

- AC-058: Angenommen ich öffne „Reise eintragen“ · Dann steht dieser Satz unter „Wer?“, und der alte
  Satz „Wer weg ist, fehlt bei „Wer isst mit?“.“ steht nirgends mehr.

## Entscheidungen

Alle ENTSCHIEDEN von Claude nach Enricos Regel „Empfehlung nehmen“ (22.11.2026), sofern nicht
anders vermerkt.

1. **Fest und Person reist → Termin wartet** (statt: bleibt fällig und läuft auf, oder geht an
   andere). Empfehlung, weil „Fest“ heißt „das macht Enrico“ und es dieselbe Regel wie beim ganzen
   Haushalt ist; niemand bekommt eine Erinnerung für eine Aufgabe, die nicht seine ist.
2. **„Zu zweit“ mit einer Person weg → wartet**, bis alle da sind („Braucht euch beide“). „Zu zweit“
   heißt wie im Code alle Mitglieder.
3. **Abwechselnd:** Vertretung = nächste Person der Reihe, die da ist; danach weiter ab der Person,
   die erledigt hat (`nextAssignee` unverändert). Empfehlung: Reihenfolge bleibt, nichts wird
   nachgeholt, kein Zähler nötig.
4. **Abgeleitet, nichts gespeichert** (statt `next_due_on` beim Anlegen einer Reise umzuschreiben):
   keine Migration für Reisen, Ändern und Löschen wirken sofort, keine Sync-Konflikte.
5. **Vor der Reise offene Termine** bleiben und zählen danach ab ihrem Termin (ehrlich), sind aber an
   nicht freien Tagen ausgeblendet, damit „Zu tun“ in der Reise leer bleibt (Enricos Entscheidung).
6. **Flexible Uhr pausiert nicht** (Pflanzen brauchen nach dem Urlaub Wasser).
7. **Flexibel rechnet ab `nextDueOn`** statt ab `lastDoneOn`: Erledigen setzt ihn schon auf Tag +
   Intervall; nur so gibt es „Nächstes Mal etwa“ und „Später“ für Flexibel. Betrifft
   `flexibleProgress`, `householdRow`, `private.chore_due_state` (Parität).
8. **Vorschlag ohne „Zuletzt erledigt“** bei Alle n Monate/Flexibel = heute + Intervall (statt heute);
   ersetzt Spec 0011, Offene Fragen 4 und 11 und AC-051 (neuer Termin steht vor dem Speichern im
   Feld).
9. **„Zuletzt erledigt“ ohne Verlaufseintrag** (sonst Einträge vor der 30-Tage-Grenze und ohne
   Person).
10. **„Später“ ab dem späteren von heute und Termin**, damit „Morgen“ einen künftigen Termin nie
    vorzieht.
11. **Nachtragen 30 Tage**, Server − 31 bis + 1; Tag ändern rechnet nur bei der jüngsten Erledigung
    (Kette aus Spec 0011, Offene Frage 9). Ersetzt Spec 0011, Offene Frage 10, AC-035/AC-038 (Menü).
12. **Verlaufsfilter nach Aufgabe, nicht Titel**; ersetzt Spec 0011, Nicht-Ziel „keine Filter im
    Verlauf“.
13. **Abschnitt „Noch offen“** statt „Fällig seit“ (kein ganzer Satz) und ohne „überfällig“ (ruhiger
    Ton). Ersetzt Spec 0013, Offene Fragen 8d/10b („(du, überfällig)“).
14. **Punkte:** eine Rechnung über „Zu tun“ (statt zwei Namen); die Zahl am Abschnitt „Heute“
    entfällt (Spec 0011, REQ-008 Anzeige).
15. **Spec 0013, AC-023** gilt jetzt für die vertretende Person; AC-026 bleibt wahr (am Tag niemand),
    neu ist die Erinnerung am Tag nach der Reise (AC-055). Spec 0010, Offene Frage 1 ist damit
    erledigt.
16. **Wer „dran“ ist, gilt für den nächsten Termin**, also schon vor der Reise die Vertretung (sonst
    springt der Avatar am Reisetag um).
17. **Überspringen bei „Einmalig“ ausgeblendet**: es würde nur das Datum löschen.
18. Abgestimmt mit Spec 0022, 22.11.2026: „weg“ heißt „steht auf einer Reise“ (`trip_members`); eine
    Reise „des ganzen Haushalts“ ist nur abgeleitet und gilt nicht für später Beigetretene. Der Satz
    zur Wirkung steht nur unter „Wer?“ beim Anlegen. Abgestimmt mit Spec 0027: dessen Schalter
    „Erinnern“ an der Aufgabe kommt nach dieser Spec und gilt zusätzlich zu REQ-014.

Beim Bau ENTSCHIEDEN von Claude (22.11.2026), jeweils die einfachste Lösung im Sinne der Spec:

19. **Reihenfolge von „Zu tun“, „Noch offen“ und Tagesüberblick:** Offenes zuerst, darin das zuletzt
    fällig gewordene zuerst („fällig seit gestern“ vor „fällig seit 3 Tagen“, wie AC-027/AC-029),
    dann gespeicherter Termin, dann Titel (REQ-011); gleich in `dueChores` und SQL.
20. **Tagesüberblick** nennt nur „fällig seit …“ als Zusatz; „heute, nach der Reise“ und „jetzt/bald
    fällig“ stehen nur in der App (der Überblick beginnt schon mit „Heute:“).
21. **Haushalt-Zeile, ganzer Haushalt weg:** Geplantes und Offenes fehlen; wirklich Erledigtes (✓)
    bleibt sichtbar (Erledigen während der Reise ist erlaubt).
22. **„Zuletzt erledigt (optional)“:** Chips „Ohne Datum“, „Datum …“, „heute“, „gestern“,
    „vorgestern“; der Kalender sperrt Tage nach heute.
23. **„Datum ändern“** zeigt keinen eigenen Hinweis; der Eintrag steht sichtbar am neuen Tag.
24. **Feste Person** = `next_assignee_id`, sonst `memberId` (wie bisher bei Erinnerungen); eine
    Rotation ohne gespeicherte nächste Person erinnert weiter alle der Reihe (Spec 0013,
    Decision 9), mit nächster Person die Vertretung.
25. **Gemeinsamer Kalender-Baustein:** `PlanDateCalendar` liegt jetzt in
    `apps/app/src/lib/plan-date-calendar.tsx`.
26. **Zeitplaner:** sucht den freien Tag nur an Reise-Enden statt Tag für Tag (gleiches Ergebnis
    wie core, Aufwand nach Zahl der Reisen; Befund des Security-Checks).
27. iPhone-Durchklick Runde 2 (27.11., I-07, I-17): „Neue Aufgabe“ fragt mit getipptem Titel vor
    dem Schließen „Änderungen verwerfen?“. Das „+“ in der Kopfzeile von „Haushalt“ steht am Handy
    schlicht wie das „+“ von „Essen“ (Kopfzeilen der Bereiche ohne getönten Kreis; Unterseiten von
    „Verwalten“ behalten ihren Kreis).

## Daten

- **Keine neuen Spalten.** Termin, Person und „Zuletzt“ stehen schon an `chores` (`next_due_on`,
  `next_assignee_id`, `last_done_on`, mit Update-Grant). Reisen wirken abgeleitet; keine Migration für
  Reisen.
- **`private.complete_chore`:** Tag `current_date - 31 … + 1`.
- **Neue Domänen-Operation** in `apply_changes`: Tag einer Erledigung ändern (`event_id`, `done_on`,
  gesehener Stand wie bei `complete_chore`, neuer Termin/„Zuletzt“ nur bei der jüngsten). Kein
  Update-Grant auf `chore_events.done_on`.
- **Zeitplaner:** gemeinsame SQL-Funktionen für „Termin nach Reisen“ und „wer ist dran“ (liest `trips`/`trip_members` aus Spec 0022, nur des Haushalts), genutzt von `chore_due_state`, `chore_assignees`,
  `chore_reminder_candidates`, `daily_summary_body`; Text „fällig seit …“ als eigene Funktion.
- **Entfällt:** Link `chores-show-all`; Abschnitt „Fällig seit“; `doneOnChoices` als 3-Tage-Grenze
  und `checkDay`; `postponeChore` mit festem + 1; `dueText` in `today-chores.tsx` (doppelt zu
  `overdueLabel`); `NO_DATE_HINT`; `flexibleDue` über `lastDoneOn` in `household-row.ts`; der Text
  „überfällig“ in `daily_summary_body` und `notification_scheduler.test.sql`.
- **Altlast für 0022/0028:** Code spricht noch von `Absence`/`absences`, die Seite `features/absences`
  sagt schon „Reise“; Umbenennen ist Sache von Spec 0022. `PlanDateCalendar` liegt im Kalender-Feature
  und wird von Haushalt mitbenutzt: in einen gemeinsamen Baustein ziehen.

## Risiken

| Risiko                                             | Gegenmaßnahme                                                                    | Test                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| App und Zeitplaner rechnen Reise-Regel verschieden | eine Fixture-Menge, Namen wie die core-Tests                                     | pgTAP `notification_parity` AC-056 ↔ vitest `chore-schedule.test.ts` AC-056 (gleiche Zeilen)     |
| Reisen eines fremden Haushalts wirken              | Funktionen filtern auf `household_id` der Aufgabe                                | pgTAP `notification_parity` AC-044, AC-057                                                       |
| Tag ändern verschiebt fremde oder falsche Aufgabe  | `security definer` mit Mitgliedschaft, gesperrte Zeile, gesehener Stand, Grenzen | pgTAP `chore_event_day.test.sql` (fremd, abgemeldet, direkt, ungültiger Tag, veraltet, entfernt) |
| Erinnerung an die falsche Person oder doppelt      | Dedupe-Schlüssel je Aufgabe und neuem Tag, `is_silent` bleibt                    | pgTAP `chore_trip_scheduler.test.sql` (AC-053–AC-055), `notification_scheduler` AC-035           |
| Endlosschleife bei vielen Reisen                   | Suche nach freiem Tag begrenzt (`MAX_WAIT_DAYS` = 400), SQL nur an Reise-Enden   | vitest und pgTAP: Reise über 400 Tage                                                            |

## Umsetzung

- [x] 1. core: Termin nach Reisen, freier Tag, Vertretung, Fälligkeitstexte, Punkte; Flexibel ab
      `nextDueOn`; `firstDueOn`-Vorschlag (AC-005, AC-007, AC-027–AC-048)
- [x] 2. Migration: `complete_chore` 30 Tage, Operation „Tag ändern“, Zeitplaner-Funktionen, Texte;
      pgTAP inkl. Parität und Negativtests (AC-020, AC-023, AC-029, AC-053–AC-057)
- [x] 3. api: `postponeChore(choreId, day)`, Nachtragen mit Tag, Tag ändern, Formularfelder Termin,
      „Zuletzt“, „Als Nächstes dran“ (AC-004–AC-010, AC-013–AC-015, AC-019–AC-023)
- [x] 4. Formular: „Datum …“, „Nächstes Mal“, „Zuletzt erledigt“, „Als Nächstes dran“, „Egal“ bei
      Bedarf (AC-001–AC-012)
- [x] 5. Aufgabe und Haushalt: Später-Menü, Knöpfe je Rhythmus, „Ohne Termin“, Link weg, „Noch
      offen“, Punkte, Reise-Satz (AC-012–AC-018, AC-031–AC-033, AC-049)
- [x] 6. Verlauf: Filter, „Alle Einträge ›“, „Datum ändern“ (AC-021–AC-026)
- [x] 7. Übersicht und Kalender: Texte, Punkte, Satz während der Reise, Haushalt-Zeile
      (AC-027–AC-032, AC-037, AC-048–AC-052); Satz im Reise-Fenster mit Spec 0022 (AC-058)
- [x] 8. `/security-check` auf Migration und Zeitplaner (0 kritisch/hoch; „mittel“ Rechenlast des
      Zeitplaners behoben, Entscheidung 26; Hinweis: keine Obergrenze für Aufgaben je Haushalt —
      offen für Spec 0028)
- [x] Nachweis (22.11.2026): `pnpm format:check`, `pnpm check` (lint, typecheck, alle Vitest-Suites) und
      `pnpm build:web` grün; `pnpm db:reset && pnpm exec supabase test db` grün (40 Dateien, neu
      `chore_event_day`, `chore_trip_scheduler`, Parität in `notification_parity`); e2e
      `rundgang-haushalt-termine.spec.ts` nur typgeprüft (läuft in Spec 0028).
