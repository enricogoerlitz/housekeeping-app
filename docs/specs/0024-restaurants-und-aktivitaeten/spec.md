---
status: freigegeben
datum: 2026-11-22
---

# 0024 — Restaurants und Aktivitäten verwalten

**Quelle:** ER-21, ER-22, ER-23, ER-29, ER-34; R-01–R-04, X-02, A-02
(`docs/product/review-enrico-2026-11-22.md`, `docs/product/review-logik-und-bedienung.md`).

**Kritischer Pfad:** ja — Löschen von Daten (RPCs, Schnappschuss, Grabsteine, Fotos, „Rückgängig“),
RLS des Speichers (neuer Ordner `restaurants`), Migration (neue Spalten mit Prüfungen, entzogenes
Löschrecht).

## Ziel

Jedes Feld eines Restaurants lässt sich in einem Fenster ändern, dazu Webseite und Foto;
Aktivitäten bekommen die Webseite auch. „Einplanen“ öffnet an Restaurant und Aktivität ein Fenster
und bleibt auf der Seite; Besuche sind antippbar. Restaurants und Aktivitäten haben denselben
Aufbau (ab Tablet Liste links, Gewähltes rechts), die Aktivitäten eine eigene Seite unter
„Verwalten“, und beide lassen sich mit „Rückgängig“ löschen.

## Nicht-Ziele

- Kein Favicon der Webseite als Ersatzbild; ohne Foto bleibt der Platzhalter (Entscheidung 3).
- Uhrzeit an Restaurant- und Aktivitäts-Einträgen und die eine Erinnerung je Eintrag (K-09) regelt
  Spec 0021 (REQ-013, REQ-014); das Einplanen-Fenster nutzt deren Feld.
- Keine Zurück-Beschriftung, keine Adress-Parameter, kein Fokus/Hover: Spec 0019 („steht nach Spec
  0019 in der Adresse“). Rezeptseite, ihr Einplanen und Löschhinweis: Spec 0023.
- Kein Löschen aus der Liste heraus; keine Schlagworte an Aktivitäten, kein Schlagwort-Filter.

## Schon erledigt

- A-02, Weg aufs Handy: ⊞ „Verwalten“ → „Planen“ → „Aktivitäten“ besteht
  (`apps/app/src/features/manage/manage-entries.ts`, Spec 0010 AC-039); REQ-009 verlegt nur die Seite.
- A-01: „Anderes Datum …“ beim Einplanen einer Aktivität (Spec 0016 AC-020, `DayPicker` in
  `features/meal-plan/add-entry-sheet.tsx`); REQ-005/006 nutzen den Baustein.
- Foto an Aktivitäten (Spec 0004, `features/activities/activity-detail.tsx` `PhotoBlock`);
  Restaurant neben der Liste ab Tablet (`features/restaurants/restaurants-panel.tsx`, `ListDetail`).

## Anforderungen

Beispiele: Haushalt „Enrico & Nadja“, angemeldet Enrico, online, Tageszeiten Vormittag/Mittag/Abend,
heute So 22.11.2026. „Trattoria Da Enzo“ (Italienisch, €€, Severinstraße 12, Köln) stand Di 3.11.
abends im Kalender und steht Sa 28.11. abends wieder darin. „Eislaufen“ stand So 8.11. vormittags
mit Zusatz „Halle Nord“ darin und steht Sa 5.12. wieder darin. Offline-Hinweis überall: „Offline –
zum Bearbeiten brauchst du Netz“.

### Restaurant bearbeiten

**REQ-001 — Bearbeiten-Fenster.** „Bearbeiten“ öffnet „Restaurant bearbeiten“ mit dem Formular von
„Restaurant hinzufügen“, vorbelegt; Felder: Karten-Link, Name, Küche, Adresse, Preis, Schlagworte
(wie am Rezept, höchstens 30), Webseite, Foto, Notiz. „Speichern“ → „Restaurant gespeichert“, ✕
verwirft. Ein geleerter Karten-Link entfernt Koordinaten und Link. Dieselben Felder in „Neu →
Restaurant“ des Hinzufügen-Fensters. Quelle: R-01. Offline: lesend, „Bearbeiten“ ausgegraut.

- AC-001: Angenommen „Taverna Olympia“ hat Küche „Grieschisch“ · Wenn ich „Griechisch“ eintrage und speichere · Dann steht „Restaurant gespeichert“, die Detailansicht zeigt „Griechisch“, der Küche-Filter bietet „Griechisch“ statt „Grieschisch“, Nadjas Gerät nach dem Abgleich ebenso.
- AC-002: Angenommen „Trattoria Da Enzo“ · Wenn ich „Bearbeiten“ wähle · Dann zeigt jedes Feld den gespeicherten Wert · Wenn ich Schlagwort „pasta“ anlege, Preis „€€€“ setze, speichere · Dann zeigt die Ansicht „Italienisch · €€€“ und „pasta“, die Suche „pasta“ findet das Restaurant.
- AC-003: Wenn ich den Namen lösche und speichere · Dann bleibt das Fenster offen mit „Name fehlt“ am Feld, der Name bleibt „Trattoria Da Enzo“.
- AC-004: Wenn ich den Karten-Link von „Pho Saigon“ einfüge · Dann steht „Gibt es schon: Pho Saigon“ mit „Öffnen“, „Speichern“ ist gesperrt (der eigene Link zählt nicht).
- AC-005: Angenommen Nadja hat das Restaurant inzwischen gelöscht · Wenn ich speichere · Dann kommt „Hat nicht geklappt – bitte noch einmal versuchen“, nach dem Abgleich „Restaurant nicht gefunden“.

**REQ-002 — Notiz nur im Fenster.** Die Detailansicht zeigt die Notiz nur zum Lesen, mit Stift
„Notiz bearbeiten“ bzw. „Notiz hinzufügen“, die „Restaurant bearbeiten“ mit Fokus im Feld „Notiz“
öffnen; das Feld, das beim Verlassen still speichert, entfällt. Quelle: R-04. Offline: lesend.

- AC-006: Angenommen Notiz „Trüffelpasta! Am Wochenende reservieren.“ · Dann steht sie ohne Eingabefeld da · Wenn ich „Notiz bearbeiten“ wähle · Dann öffnet sich „Restaurant bearbeiten“ mit Fokus in „Notiz“.
- AC-007: Angenommen „Pho Saigon“ ohne Notiz · Dann steht „Noch keine Notiz“ mit „Notiz hinzufügen“.

### Webseite und Foto

**REQ-003 — Webseite.** Restaurant und Aktivität haben das optionale Feld „Webseite“ (Beispiel „z. B.
trattoria-da-enzo.de“); Prüfung, Ergänzen von `https://` und Meldungen wie bei den Rezept-Links
(Spec 0023 REQ-009), auf dem Gerät und in der Datenbank. Knopf „Webseite“ neben „Route“ öffnet einen neuen Tab
(`noopener`, `noreferrer`); leeres Feld entfernt ihn. Quelle: ER-22. Offline: lesend; der Knopf
bleibt bedienbar wie „Route“.

- AC-008: Wenn ich „trattoria-da-enzo.de“ eintrage und speichere · Dann ist „https://trattoria-da-enzo.de“ gespeichert, „Webseite“ öffnet sie in einem neuen Tab, die App zeigt weiter „Trattoria Da Enzo“.
- AC-009: Wenn ich nacheinander „javascript:alert(1)“, „ftp://enzo.de“, „mailto:info@enzo.de“ speichern will · Dann zeigt das Feld „Nur Adressen mit http:// oder https://“ · Wenn „trattoria da enzo“ oder „localhost“ · Dann „Keine gültige Adresse“; das Fenster bleibt jedes Mal offen.
- AC-010: Wenn ein Mitglied an der App vorbei „javascript:alert(1)“ oder „https://enzo.de/ x“ als Webseite schreibt · Dann lehnt die Datenbank per Prüfregel ab.
- AC-011: Wenn ich bei „Eislaufen“ „https://www.eisstadion-koeln.de“ speichere · Dann hat die Aktivität den Knopf „Webseite“ · Wenn ich das Feld leere · Dann ist er weg.

**REQ-004 — Foto am Restaurant.** Wie bei Aktivitäten (Spec 0004, REQ-004): in Detailansicht (16:9,
darunter „Foto hinzufügen/ändern“, „Foto entfernen“) und Formular; verkleinert auf ≤ 1600 px, JPEG
ohne Metadaten, privater Ordner des Haushalts; dieselben Texte. Es erscheint auf der Karte der
Liste, in der Detailansicht und auf der Übersicht dort, wo Aktivitäten ein Foto zeigen; sonst das
Besteck-Symbol. Quelle: ER-23. Offline: Ändern nur online, geladene Fotos sichtbar.

- AC-012: Wenn Enrico ein Foto 4000 × 3000 hinzufügt · Dann „Foto gespeichert“, Karte und Ansicht zeigen es, gespeichert ist 1600 × 1200 JPEG, Nadjas Gerät zeigt es nach dem Abgleich.
- AC-013: Wenn ich „Foto entfernen“ wähle · Dann „Foto entfernt“, überall das Besteck-Symbol, die Datei ist im Speicher gelöscht.
- AC-014: Wenn ich eine PDF oder ein Bild über 15 MB wähle · Dann „Dieses Bild können wir nicht verwenden“, nichts hochgeladen; offline ist „Foto ändern“ ausgegraut.
- AC-015: Wenn ein fremder Haushalt oder `anon` das Foto liest, überschreibt oder löscht, oder jemand als `photo_path` einen Pfad eines anderen Haushalts, Restaurants oder einer Aktivität einträgt · Dann wird abgelehnt (Policy bzw. Prüfregel).

### Einplanen

**REQ-005 — Einplanen-Fenster am Restaurant.** „Einplanen“ öffnet das Fenster „Einplanen“ statt des
Kalenders. Es ist das Einplanen-Fenster der Rezepte (Spec 0023 REQ-013): Name; „Wann?“ als
Woche mit Tages-Chips samt Datum, KW blättern ‹ ›, „Anderes Datum …“; „Ohne Tag vormerken“;
„Tageszeit“ (Vorwahl nach Spec 0020 REQ-005: „Abend“, sonst die letzte); „Wer isst mit?“ (alle, die an dem Tag nicht unterwegs
sind) mit Gästen; „Uhrzeit (optional)“ (Spec 0021 REQ-013, fehlt beim Vormerken; mit Uhrzeit
schaltet sich die Erinnerung nach Spec 0021 REQ-014 ein); „Zusatz (optional)“ (Spec 0021 REQ-008).
Knopf „Am Sa 28.11. Abend einplanen“ bzw. „Vormerken“; ohne Mitesser gesperrt mit „Wähl aus,
wer mitisst.“ Danach bleibt die Seite, Hinweis „Eingeplant: Sa 28.11., Abend“ (anderes Jahr mit
Jahreszahl) bzw. „Vorgemerkt“ mit „Ansehen“ → Kalender, Woche des Tags. Quelle: ER-21, R-02.
Offline: nur online, „Einplanen“ ausgegraut.

- AC-016: Wenn ich am So 22.11. „Einplanen“ wähle · Dann zeigt das Fenster „KW 47 · 16.–22. Nov“, gewählt sind „So 22.11.“, „Abend“, Enrico und Nadja · Wenn ich ›, „Sa 28.11.“, Uhrzeit 19:30 und „Am Sa 28.11. Abend einplanen“ wähle · Dann bin ich weiter auf der Restaurantseite, Hinweis „Eingeplant: Sa 28.11., Abend“, im Kalender Sa abends „Trattoria Da Enzo · 19:30“ mit „Erinnern“ am Tag um 17:30.
- AC-017: Wenn ich im Hinweis „Ansehen“ wähle · Dann zeigt der Kalender die Woche „KW 48 · 23.–29. Nov“.
- AC-018: Wenn ich „Anderes Datum …“ → 15.1.2027 → „Mittag“ einplane · Dann „Eingeplant: Fr 15.1.2027, Mittag“ · Wenn ich „Ohne Tag vormerken“ wähle · Dann fehlt „Uhrzeit“, Knopf „Vormerken“, Hinweis „Vorgemerkt“.
- AC-019: Angenommen Nadja ist 26.–29.11. auf Reise · Wenn ich „Sa 28.11.“ wähle · Dann ist nur Enrico gewählt · Wenn ich ihn abwähle · Dann ist der Knopf gesperrt mit „Wähl aus, wer mitisst.“
- AC-020: Angenommen Nadja hat das Restaurant inzwischen gelöscht · Wenn ich einplane · Dann entsteht kein Eintrag, Hinweis „Das Restaurant gibt es nicht mehr.“

**REQ-006 — Dasselbe Fenster an der Aktivität.** Wie REQ-005, aber vorbelegt die erste Tageszeit
(„Vormittag“) und ohne „Wer isst mit?“; „Uhrzeit (optional)“ und „Zusatz (optional)“ wie dort; kein
Suchfeld mehr. Quelle: R-04,
ER-34. Offline: nur online.

- AC-021: Wenn ich bei „Eislaufen“ „Einplanen“, „Sa 5.12.“, Zusatz „Halle Nord“ wähle und einplane · Dann bleibe ich auf der Seite, Hinweis „Eingeplant: Sa 5.12., Vormittag“ mit „Ansehen“, im Kalender „Eislaufen (Halle Nord)“.
- AC-022: Angenommen Nadja hat „Eislaufen“ inzwischen gelöscht · Wenn ich einplane · Dann kein Eintrag, Hinweis „Die Aktivität gibt es nicht mehr.“

### Besuche

**REQ-007 — Besuche antippbar.** Die Zeile „Zuletzt: vor 19 Tagen · 1 Besuch ›“ (Aktivität „… ·
1-mal ›“) scrollt zum Abschnitt „Besuche“ (Aktivität „Verlauf“) und fokussiert dessen Überschrift;
er listet Tage bis heute ohne „Nicht gemacht“, neuester zuerst („Dienstag, 3. November 2026“ · „vor
19 Tagen“); eine Zeile öffnet den Kalender in der Woche des Tags. Quelle: R-03. Offline:
vollständig.

- AC-023: Wenn ich bei „Trattoria Da Enzo“ die Zeile wähle · Dann steht „Besuche“ im Bild mit genau „Dienstag, 3. November 2026“, nicht 28.11. · Wenn ich die Zeile wähle · Dann zeigt der Kalender „KW 45 · 2.–8. Nov“ mit „Trattoria Da Enzo“ am Dienstag.
- AC-024: Wenn ich bei „Eislaufen“ „Zuletzt: vor 14 Tagen · 1-mal“ und dann „Sonntag, 8. November 2026“ wähle · Dann zeigt der Kalender „KW 45 · 2.–8. Nov“.
- AC-025: Angenommen „Pho Saigon“ steht nur am 28.11. und am 1.11. als „Nicht gemacht“ · Dann steht „Noch kein Besuch im Plan“ ohne Knopf, der Abschnitt sagt „Noch kein Besuch. Vergangene Tage aus dem Kalender stehen dann hier.“

### Aufbau und Aktivitäten-Seite

**REQ-008 — Liste und Detail.** Restaurants (wie gebaut) und Aktivitäten (neu) ab 700 px: ohne Wahl
Raster der Karten; mit Wahl links die Liste (≤ 380 px, Gewähltes hervorgehoben), rechts die
Detailansicht mit ✕ („Aktivität schließen“) zurück zum Raster; Suche, Filter, Sortierung und
Scrollstelle bleiben; alles Ändern geht rechts. Handy: Karte öffnet die eigene Seite. Rezepte
bleiben ganze Seiten. Quelle: ER-34, R-04. Offline: lesend.

- AC-026: Angenommen 900 px, „Bouldern“, „Eislaufen“, „Spieleabend“ im Raster · Wenn ich „Eislaufen“ wähle · Dann links die Liste mit „Eislaufen“ hervorgehoben, rechts seine Ansicht · Wenn ich „Bouldern“ wähle · Dann wechselt nur rechts, die Liste bleibt stehen · Wenn ich „Aktivität schließen“ wähle · Dann wieder das Raster.
- AC-027: Angenommen 1440 px, Suche „eis“, „Eislaufen“ gewählt · Wenn ich rechts den Namen in „Eislaufen Neuss“ ändere · Dann zeigen rechts und die Karte links „Eislaufen Neuss“, die Suche bleibt „eis“.
- AC-028: Angenommen Handy · Wenn ich „Eislaufen“ wähle · Dann öffnet /aktivitaet/<id>, „Zurück“ führt an dieselbe Stelle der Liste.
- AC-029: Angenommen 1440 px, „Trattoria Da Enzo“ gewählt · Wenn Nadja es löscht und mein Gerät abgleicht · Dann verschwindet die Karte, rechts „Restaurant nicht gefunden“ mit „Zu den Restaurants“ (→ Raster).

**REQ-009 — Eigene Seite unter „Verwalten“.** Die Seite liegt unter `/aktivitaeten`, eine Aktivität
auf dem Handy unter `/aktivitaet/<id>`, in der Gruppe „Verwalten → Planen“ (Seitenleiste bzw. ⊞),
kein Tab hervorgehoben; `/kalender/aktivitaeten` und `/kalender/aktivitaet/<id>` zeigen „Nicht
gefunden“ (keine Weiterleitung). Der Kalender-Kopf verliert das Berg-Symbol in allen Ansichten,
⋯ bekommt keinen Ersatz. „Aktivität öffnen“ (Eintragsfenster) und die Übersicht öffnen die neue
Adresse (ab Tablet mit Wahl). Quelle: ER-29, A-02. Offline: lesend.

- AC-030: Angenommen Desktop · Dann kein Berg-Symbol im Kalender-Kopf (Woche, Monat, Jahr) · Wenn ich „Verwalten → Aktivitäten“ wähle · Dann /aktivitaeten, „Aktivitäten“ hervorgehoben, „Kalender“ nicht, auch mit gewählter „Eislaufen“.
- AC-031: Angenommen Handy, „Liste“ offen · Wenn ich ⊞ → „Aktivitäten“ → „Eislaufen“ und zweimal „Zurück“ wähle · Dann erst „Aktivitäten“, dann „Verwalten“; kein Tab hervorgehoben.
- AC-032: Wenn ich am Handy im Eintrag „Eislaufen (Halle Nord)“ „Aktivität öffnen“ wähle · Dann /aktivitaet/<id>; am Desktop /aktivitaeten mit „Eislaufen“ rechts.
- AC-033: Wenn ich /kalender/aktivitaeten aufrufe · Dann „Nicht gefunden“ mit „Diese Seite gibt es nicht (mehr).“; offline zeigt /aktivitaeten die Aktivitäten, „Aktivität anlegen“ ausgegraut.

### Löschen

**REQ-010 — Löschen mit „Rückgängig“.** Menü ⋯ („Mehr zu <Name>“) der Detailansicht hat „Löschen“
ohne Rückfrage. Einträge mit Tag bis einschließlich heute werden Freitext mit dem Namen (Aktivität
mit Zusatz „Eislaufen (Halle Nord)“; die Uhrzeit entfällt, weil Freitext keine hat, „Erinnern“
bleibt), spätere und vorgemerkte entfallen. Hinweis nach Spec 0023 REQ-012: „Trattoria Da Enzo
gelöscht · 1 geplanter Eintrag entfällt“ (n: „n geplante Einträge entfallen“, ohne: „Trattoria Da
Enzo gelöscht“) mit 5 s „Rückgängig“; danach
Raster bzw. Liste. Das Foto wird erst gelöscht, wenn der Hinweis ohne „Rückgängig“ endet und der
Server bestätigt hat. Zurückholen nur durch die löschende Person, ≤ 1 h. Quelle: X-02, E-03.
Offline: nur online, „Löschen“ ausgegraut.

- AC-034: Wenn ich „Trattoria Da Enzo“ lösche · Dann Hinweis „Trattoria Da Enzo gelöscht · 1 geplanter Eintrag entfällt“, Di 3.11. steht „Trattoria Da Enzo“ als Freitext ohne Restaurant-Symbol, Sa 28.11. ist leer, Restaurant fehlt in Liste, Filter und Hinzufügen-Fenster, Nadjas Gerät nach dem Abgleich ebenso.
- AC-035: Wenn ich danach „Rückgängig“ wähle · Dann sind Restaurant mit Bewertungen und Favoriten, der Eintrag Sa 28.11. mit 19:30 und der Restaurant-Eintrag Di 3.11. zurück, auf beiden Geräten.
- AC-036: Wenn ich „Eislaufen“ mit Foto lösche und den Hinweis auslaufen lasse · Dann steht So 8.11. „Eislaufen (Halle Nord)“ als Freitext, Sa 5.12. entfällt, die Fotodatei ist gelöscht; mit „Rückgängig“ bleibt sie.
- AC-037: Angenommen Nadja hat den Freitext vom 3.11. vor meinem „Rückgängig“ in „Pizza bei Enzo“ geändert · Dann bleibt er so, der Rest kommt zurück.
- AC-038: Wenn Nadja oder ein fremder Haushalt `restore_restaurant` für Enricos Löschung bzw. `delete_restaurant`/`delete_activity` für ein fremdes Restaurant ruft, oder `anon` · Dann abgelehnt (`…_not_restorable`, `…_not_found`, `not_authenticated`), nichts ändert sich; ein direktes `delete` über die API ist nicht erlaubt.

## Entscheidungen

Alle Claude nach Enricos Regel „Empfehlung nehmen“, 22.11.2026, außer wo vermerkt.

1. Bearbeiten als Fenster mit dem Anlege-Formular (R-01-Empfehlung); Notiz nur dort (R-04: kein stilles Speichern beim Verlassen).
2. Webseite auch an Aktivitäten (Kletterhalle, Kino): ein Muster für beide. `https://` wird ergänzt, weil Links meist ohne Schema getippt werden.
3. Kein Favicon (Enricos Idee): A Favicon über Dritte (Google) — schickt jede Webseite an einen Dienst, braucht Netz und CSP-Ausnahme · B Server holt es — neuer Abrufdienst, SSRF-Risiko · C Platzhalter. Gewählt C.
4. Einplanen-Fenster: ein gemeinsames für Restaurant und Aktivität mit Tag-Chips + „Anderes Datum …“ (wie 0016), Hinweis mit „Ansehen“ wie beim Rezept. Kein Block „Erinnern“ im Fenster (wie beim Rezept). Abgestimmt mit Spec 0021, 22.11.2026: „Reserviert um“ und „Erinnern 2 h vorher“ entfallen; beide Arten bekommen „Uhrzeit (optional)“ und „Zusatz“, die Erinnerung schaltet sich mit der Uhrzeit ein (0021 REQ-014); Knopf mit Datum wie beim Rezept (Spec 0023 REQ-013).
5. Aufbau: gebautes Restaurant-Muster (Raster bis zur Wahl, dann Liste und Detail mit ✕) auch für Aktivitäten, weil Enrico es so mag (ER-34); Rezepte bleiben ganze Seiten (lange Inhalte, Kochmodus).
6. A-02: Enricos ER-29 schlägt die Empfehlung „ins ⋯-Menü“: kein Weg im Kalender-Kopf; Zugang über „Verwalten“.
7. Löschen wie Rezepte (Spec 0008): vergangene Einträge als Freitext mit Namen statt Namens-Spalte oder Verweis auf Gelöschtes — gleiche Regel für alle drei, kein neues Datenfeld. „Heute“ zählt als Verlauf wie beim Rezept. Hinweistext gemeinsam mit 0023 (E-03) aus `packages/core`. Abgestimmt mit Spec 0023, 22.11.2026: „geplanter Eintrag“ statt „geplanter Termin“ (Glossar „Eintrag“), Web-Adresse nach 0023 REQ-009.
8. Abgestimmt mit Spec 0023, 22.11.2026: Restaurant und Aktivität nutzen das Einplanen-Fenster der
   Rezepte (0023 REQ-013, Entscheidung 14: Woche mit Tages-Chips und Datum, KW blättern, „Anderes
   Datum …“), ergänzt um „Uhrzeit (optional)“ und „Zusatz“. Ein Fenster für alles, passend zum
   Kalender in KW; 0024 baut kein eigenes. Ersetzt die „14 Tage ab heute“ aus Entscheidung 4.
9. Besuche: Abschnitt „Besuche“ (Glossar „Besuch“) am Restaurant, „Verlauf“ bleibt an der Aktivität (gebaut).
10. Beim Bau (Claude, 22.11.2026): Der Freitext trägt Name und Zusatz in einem Text, „Zusatz“ wird geleert („Eislaufen (Halle Nord)“, auch am Restaurant, seit 0021 hat jede Art einen Zusatz); „Rückgängig“ setzt Zusatz und Uhrzeit zurück.
11. Beim Bau: „Rückgängig“ stellt die entfallenen Einträge mit allen Spalten wieder her (auch Erinnerung und Uhrzeit), über eine gemeinsame Funktion `private.restore_plan_entries`, die nun auch `restore_recipe` nutzt (vorher gingen Erinnerungen dort verloren).
12. Beim Bau: Ein beim Einplanen neu angelegtes Restaurant oder eine Aktivität bleibt bei „Rückgängig“ bestehen (wie Artikel), weil `apply_changes` sie nicht mehr löscht; der Eintrag geht.
13. Beim Bau: Der Kommentar im Kopf der eingefrorenen Storage-Migration bleibt stehen; die neue Migration ersetzt seine Aussage, 0028 fasst beide zusammen.
14. Beim Bau: Fenster „bearbeiten“/„einplanen“ stehen in der Adresse (`/rezepte?…&restaurant=…&fenster=bearbeiten`, `/aktivitaeten?aktivitaet=…&fenster=…`, `/aktivitaet/<id>?fenster=…`); die Fokus-Wahl „Notiz“ ist nicht in der Adresse.
15. Beim Bau: Die Zeile „Zuletzt …“ springt mit Scrollen und Fokus auf die Überschrift nur im Browser (PWA); ohne Besuch ist sie kein Knopf.

- Ändert ältere AC: 0002 AC-010 (Notiz jetzt im Fenster); 0004 Nicht-Ziel „Keine Fotos für Restaurants“; 0005 AC-002 (Aktivität hebt keinen Tab hervor); 0010 AC-001 (kein ▲), REQ-008/AC-025–027/AC-039–041 (Adresse `/aktivitaeten`, kein ▲); 0004 Daten „Löschen löscht sein Foto“ (erst nach „Rückgängig“-Frist).
- Glossar (Hauptsitzung): neu „Webseite“ (`websiteUrl`/`website_url`); „Aktivität“ (Adresse `/aktivitaeten`, unter Verwalten, kein ▲); „Restaurant“ (Foto, Webseite); „Verlauf“ wird auch für Aktivitäten benutzt — Abgrenzung nötig.

## Daten

- `restaurants`: neu `website_url text` (Check `private.is_web_url(website_url)`, Spec 0023), `photo_path text` (Check wie Aktivitäten: `<household_id>/restaurants/<id>/<uuid>.jpg`). `activities`: neu `website_url` (gleicher Check).
- Speicher: `private.media_household_id` erlaubt zusätzlich den Ordner `restaurants`.
- Löschen: `delete_restaurant(id, today)`/`restore_restaurant(id)`, `delete_activity(id, today)`/`restore_activity(id)` (security definer, Muster `delete_recipe`); Schnappschuss in einer gemeinsamen Tabelle `private.deletions(household_id, kind, target_id, deleted_by, deleted_at, snapshot)` (FK auf `households` on delete cascade, Spec 0027), 1 h, stündlich bereinigt; `private.recipe_deletions` zieht in dieser Spec dorthin um (`delete_recipe`/`restore_recipe` umgestellt, Verhalten unverändert). Kein `delete`-Grant mehr auf `restaurants`/`activities`, Allowlist `apply_changes` `"delete": false`, Patch um `website_url`, `photo_path`, `tags` (Restaurant) erweitern.
- Cache: neue Felder `websiteUrl`, `photoPath`; `CACHE_VERSION` erhöhen; `updateRestaurant` nimmt alle Felder.
- Entfällt: `activities.tags` (nie gesetzt), Route-Dateien `app/(tabs)/kalender/aktivitaeten.tsx`, `kalender/aktivitaet/[id].tsx`, `ManageEntry.pathPrefix`, eigene Rückweg-Logik `useActivitiesBack` (Rückweg nach Spec 0019 über `von`), Berg-Knopf `calendar-activities`, Inline-Notizfeld und Speichern-Knopf der Restaurantseite, Kommentar „client deletes before deleting an activity“ im Storage-Migrationskopf.

## Risiken

| Risiko                                           | Gegenmaßnahme                                                                                     | Test                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Fremder Haushalt löscht/holt zurück              | RPC prüft Mitgliedschaft, `…_not_found`                                                           | `restaurants_and_activities.test.sql` (AC-038), `commands-places.backend.test.ts` |
| Abgemeldet                                       | `not_authenticated`, kein Grant für `anon`                                                        | `restaurants_and_activities.test.sql` (anon)                                      |
| Andere Person holt zurück, Bewertungen gefälscht | nur löschende Person, Schnappschuss nur serverseitig (`private`, keine Grants)                    | `restaurants_and_activities.test.sql`, `recipe_deletion.test.sql`                 |
| Löschen am RPC vorbei                            | kein `delete`-Grant, Allowlist false, FK `restrict`                                               | `restaurants_and_activities.test.sql`, `apply_changes.test.sql`                   |
| Gleichzeitiges Einplanen beim Löschen            | Sperre `for update`, FK 23503 → „… gibt es nicht mehr.“                                           | pgTAP (23503), `commands-places.backend.test.ts` (AC-020, AC-022)                 |
| Zweites Gerät hält Gelöschtes                    | Grabsteine `restaurants`, Bewertungen, Favoriten, `meal_plan_entries`; `updated_at` der Freitexte | pgTAP (Grabsteine), `commands-places.backend.test.ts` (AC-034)                    |
| `javascript:`-Link als Webseite                  | Prüfung im Gerät und in der Datenbank, `noopener`                                                 | `web-link.test.ts`, pgTAP (AC-010)                                                |
| Foto in fremdem Ordner                           | Pfad-Check + Storage-Policy                                                                       | `restaurants_and_activities.test.sql` (AC-015)                                    |
| Foto verwaist (App bricht ab)                    | hingenommen wie Spec 0008 E5                                                                      | —                                                                                 |

## Umsetzung

- [x] 1. Migration + pgTAP rot zuerst: Spalten, Checks, Storage-Regex, `private.deletions` samt Umzug von `private.recipe_deletions`, vier RPCs, Grants/Allowlist (AC-010, AC-015, AC-034–038)
- [x] 2. core: Webadresse prüfen, `deletionEffect` für Restaurant/Aktivität, Löschhinweis, `plannedNotice` mit Jahr (AC-008/009, AC-018, AC-034)
- [x] 3. api: Mapping, Fake-Transport, `updateRestaurant` voll, Restaurant-Foto (`PhotoTable`), `deleteRestaurant`/`deleteActivity` mit Rückgängig, `CACHE_VERSION` (AC-001–005, AC-012–014, AC-035–037)
- [x] 4. Formular und „Restaurant bearbeiten“, Notiz nur lesen, Schlagworte, Webseite, Foto (AC-001–009, AC-011–014)
- [x] 5. Einplanen-Fenster für Restaurant und Aktivität (AC-016–022)
- [x] 6. Besuche/Verlauf antippbar (AC-023–025)
- [x] 7. Route-Gruppe `(aktivitaeten)`, Verwalten-Eintrag, Berg-Knopf weg, Links umstellen, Aktivitäten in `ListDetail` (AC-026–033)
- [x] 8. ⋯ „Löschen“ an beiden Detailansichten (AC-034–036)
- [ ] 9. `/ui-verify` (Handy, Tablet, Desktop), `/security-check`, spec-auditor
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` und `pnpm exec supabase test db`
