---
status: freigegeben
datum: 2026-11-22
---

# 0022 — Reisen im Kalender verwalten, Reisetaschen und Packlisten

**Quelle:** ER-25, K-02, T-01–T-05 (H-03 ist Spec 0026)

**Kritischer Pfad:** ja — Migrationen und Mandantengrenze (neue Tabellen `trips`, `trip_members`;
`packing_list_bags`, `packing_items` geändert), Delta-Sync und Laden-Warteschlange (Packen muss
unverändert offline gehen), Löschen (Reise samt Packliste, „Übernehmen“ entfernt Packstücke),
Ruhe der Benachrichtigungen (`private.is_silent`).

## Ziel

Eine Reise legt man im Kalender in einem Fenster an und verwaltet sie dort ganz: Zeitraum, wer,
Notiz, Reisetaschen, Packliste, Packen, Löschen; ein Tipp auf einen Reise-Streifen öffnet dieses
Fenster, man bleibt im Kalender. Beim Speichern bietet die App an, Reisende aus geplanten Gerichten
zu nehmen, damit Portionen und Einkaufsliste stimmen. Packstücke der Packliste sind änderbar,
Änderungen einer Reisetasche lassen sich in kommende Packlisten übernehmen. „Reise“ ist der eine
Begriff in Oberfläche, Code, Datenbank und Adressen.

## Nicht-Ziele

- Reisen wirken nicht auf Aufgaben (H-03, Spec 0026).
- Kein automatisches Zurücknehmen: Kürzen, Löschen oder Abwählen bringt niemanden in Gerichte zurück.
- Keine stille Rückwirkung von Reisetaschen (D35 bleibt); vergangene Packlisten ändern sich nie.
- Keine neue Offline-Aktion; Reise-Streifen werden weiter nicht gezogen (Spec 0016, Offene Frage 4).

## Schon erledigt

- ER-25 „über die Tage ziehen“ in Woche (ab 700 px), Monat, Jahr öffnet „Reise eintragen“ mit dem
  Zeitraum: Spec 0016, REQ-007; `apps/app/src/features/calendar/calendar-drag.tsx` (`TripSource`).
- „Reise“ statt „Abwesenheit“ in Texten und Adressen: Spec 0016, REQ-008 (Code und Datenbank: REQ-014).
- Packkarte zählt ab heute: Spec 0018, AC-020.

## Anforderungen

Beispiele: Haushalt „Enrico & Nadja“, angemeldet Enrico, heute So 22.11.2026. „Urlaub Mallorca“ =
Reise von Enrico und Nadja, Fr 4.12.–Do 10.12.2026 (7 Tage), Packliste „Strand“ (9, darunter
„T-Shirts · 1 je Tag“), „Kulturbeutel“ (9, für Nadja), „Technik“ (12): 30 Packstücke, 12 gepackt.
„Offline-Hinweis“ = „Offline – zum Bearbeiten brauchst du Netz“.

### Reise-Fenster

**REQ-001 — Ein Fenster für die ganze Reise.** Das Reise-Fenster zeigt Kopf (Titel = Notiz, sonst
„unterwegs“; „beginnt in 12 Tagen“; ⋯), die direkt änderbaren Felder Wer?, Von, Bis, Notiz, dann
Fortschritt und Packliste; Handy: von unten in voller Höhe; ab 700 px: Fenster „l“ in der Mitte,
Taschen als Spalten. Quelle: ER-25. Offline: lesend; Packen offline wie Spec 0012.

```
✕  Urlaub Mallorca · beginnt in 12 Tagen          ⋯
Wer? (Enrico✓)(Nadja✓) Ganzer Haushalt · Von Fr 4.12.2026 · Bis Do 10.12.2026 · 7 Tage
Notiz Urlaub Mallorca
Packliste · 12 von 30 gepackt ▓▓▓▓░░░░
STRAND 4/9 ⋯ | KULTURBEUTEL (N) 3/9 ⋯ | TECHNIK 5/12 ⋯     + Reisetasche hinzufügen
[Speichern] nur solange ein Feld geändert ist
```

- AC-001: Angenommen Woche KW 49 mit Streifen „Urlaub Mallorca“ · Wenn ich ihn antippe · Dann öffnet sich über der Woche das Fenster „Urlaub Mallorca“ mit „beginnt in 12 Tagen“, Wer? Enrico und Nadja („Ganzer Haushalt“), „Von Fr 4.12.2026“, „Bis Do 10.12.2026 · 7 Tage“, Notiz, „Packliste · 12 von 30 gepackt“, Abschnitte „Strand 4/9“, „Kulturbeutel 3/9“ (Nadjas Avatar), „Technik 5/12“, und ohne Knopf „Speichern“.
- AC-002: Angenommen Handybreite · Wenn ich das Fenster öffne · Dann füllt es von unten die ganze Höhe (✕ oben links); am Desktop steht es in der Mitte in Größe „l“, die drei Taschen als Spalten nebeneinander.
- AC-003: Angenommen Enricos Reise 30.11.–2.12.2026 ohne Notiz und ohne Taschen · Wenn ich „unterwegs bis Mi 2.12.“ antippe · Dann heißt das Fenster „unterwegs“ und zeigt „Noch keine Packliste“ mit „Reisetasche hinzufügen“.
- AC-004 (Rand): Angenommen das Fenster ist offen · Wenn Nadja die Reise löscht und mein Gerät abgleicht · Dann zeigt es „Diese Reise gibt es nicht mehr“ mit „Schließen“, ungespeicherte Felder sind ohne Fehler verworfen.

**REQ-002 — Das Fenster öffnet sich dort, wo man ist.** Streifen in Woche, Monat, Jahr,
Tages-Fenster, Liste „Reisen 2026“ im Jahr, Zeilen in „Reisen“, die Packkarte der „Übersicht“ und
„Kommende Packlisten“ öffnen das Reise-Fenster über der aktuellen Seite; die offene Reise steht nach
Spec 0019 in der Adresse; die Seite `/kalender/reise/<id>` entfällt. Quelle: ER-25. Offline: vollständig.

- AC-005: Angenommen Monat Dezember 2026 · Wenn ich „Urlaub Mallorca“ antippe, schließe, im Jahr den 5.12. antippe und im Tages-Fenster die Reise wähle · Dann öffnet sich jeweils das Reise-Fenster, und Monat bzw. Jahr mit Tages-Fenster bleiben dahinter.
- AC-006: Angenommen die „Übersicht“ zeigt Fr 4.12. mit „Reisetasche · Urlaub Mallorca“ · Wenn ich die Karte antippe und mit ✕ schließe · Dann war das Fenster über der „Übersicht“ offen, und sie zeigt weiter Fr 4.12.
- AC-007 (Rand): Angenommen das Fenster ist über Dezember 2026 offen · Wenn ich neu lade · Dann ist es wieder offen · Und `/kalender/reise/<id>` zeigt „Nicht gefunden“.

**REQ-003 — Neue Reise anlegen.** Im Zustand „Reise eintragen“ (Ziehen, ⋯, Tages-Fenster, „+“ auf
„Reisen“) wählt man Wer?, Von, Bis, Notiz und Reisetaschen-Chips; „Speichern · n Packstücke“ legt
eine Reise mit allen Personen und einer Packliste in einem Schritt an und schließt. Unter „Wer?“
steht der Satz zur Wirkung aus Spec 0026 REQ-015. Quelle: ER-25.
Offline: nur online, „Speichern“ ausgegraut mit Offline-Hinweis.

- AC-008: Angenommen ich habe im Dezember vom 4. bis 10.12. gezogen · Wenn ich Nadja dazu wähle, Notiz „Urlaub Mallorca“, Chips „Strand“ und „Kulturbeutel“ · Dann heißt der Knopf „Speichern · 18 Packstücke“; nach dem Tipp schließt das Fenster, „Reise eingetragen“, ein Streifen 4.–10.12., Packliste mit „T-Shirts 7×“.
- AC-009: Angenommen Haushalt „WG Kastanienallee“ mit Enrico, Nadja, Vera · Wenn ich eine Reise für Enrico und Vera mit „Strand“ und „Kulturbeutel“ (für Nadja) speichere · Dann gibt es genau einen Streifen mit E- und V-Badge und eine Packliste mit beiden Taschen; Hinweis „Nur Enrico und Vera“.
- AC-010 (Fehler): Alle abgewählt → „Speichern“ ausgegraut mit „Wähle, wer unterwegs ist“ · Bis vor Von → „„Bis“ liegt vor „Von““, nichts gespeichert · Serverfehler → weder Reise noch Packliste, Fenster bleibt, „Hat nicht geklappt – bitte noch einmal versuchen“.

**REQ-004 — Die Reise im Fenster ändern.** Wer?, Von, Bis, Notiz ändert man direkt; „Speichern“
erscheint bei einer Änderung, speichert nur geänderte Felder und lässt das Fenster offen; die
Packliste bleibt bei der Reise, gleich wie sich die Personen ändern. Quelle: ER-25. Offline: nur
online; Felder ausgegraut mit Offline-Hinweis, Packen geht weiter.

- AC-011: Angenommen „T-Shirts 7×“ offen, „Socken 7×“ gepackt (beide 1 je Tag) · Wenn ich „Bis“ auf Di 8.12. setze und speichere · Dann bleibt das Fenster offen, „Reise geändert“, „5 Tage“, „T-Shirts 5×“, „Socken 7×“ weiter gepackt, Streifen bis 8.12.
- AC-012: Wenn ich Nadja abwähle und speichere · Dann kommt kein Dialog, der Streifen trägt nur Enricos Badge, die Packliste hat weiter 30 Packstücke, 12 gepackt, „Kulturbeutel“ mit Nadjas Avatar.
- AC-013: Angenommen Notiz ungespeichert in „Mallorca mit Oma“ geändert · Wenn ich ✕ wähle · Dann fragt „Änderungen an der Reise verwerfen?“ („Verwerfen“, „Weiter bearbeiten“); nur gepackt, nichts geändert → ✕ schließt ohne Dialog.
- AC-014 (Konflikt): Angenommen Nadja hat inzwischen „Bis“ auf 9.12. gesetzt · Wenn ich nur die Notiz ändere und speichere · Dann heißt die Reise „Mallorca mit Oma“ und endet am 9.12.
- AC-015 (offline): Angenommen offline · Dann sind die vier Felder ausgegraut mit Offline-Hinweis · Wenn ich „Badehose“ abhake · Dann ist sie gepackt und wird mit Netz nachgereicht.

**REQ-005 — Zurücksetzen und Löschen im Fenster.** ⋯ im Kopf: „Für die Rückreise zurücksetzen“
(Spec 0012, AC-028) und „Reise löschen“; danach schließt das Fenster, die Seite darunter bleibt.
Quelle: ER-25. Offline: Zurücksetzen vollständig (ADR-0013); Löschen nur online.

- AC-016: Wenn ich ⋯ → „Reise löschen“ wähle · Dann fragt „Reise löschen?“ mit „Die Packliste mit 30 Packstücken wird mit gelöscht.“; nach „Löschen“ schließt das Fenster, „Reise und Packliste gelöscht“, die Woche bleibt ohne Streifen, Reisetaschen unverändert.
- AC-017: Angenommen Reise ohne Packliste · Wenn ich sie lösche · Dann kein Dialog, „Reise gelöscht“ mit 5 s „Rückgängig“, das den Streifen zurückbringt.
- AC-018 (offline): Angenommen Nadja offline, „30 von 30 gepackt“ · Wenn sie zurücksetzt und bestätigt · Dann „0 von 30 gepackt“, und „Reise löschen“ ist ausgegraut mit Offline-Hinweis.

**REQ-006 — „Reisen“ bleibt als Liste.** „Verwalten → Reisen“ zeigt eine Zeile je Reise (Kommend,
Vergangen), mit Koffer-Symbol und Packstand bei Packliste; ein Tipp öffnet das Reise-Fenster über
der Seite. Quelle: ER-25, T-03. Offline: lesend.

- AC-019: Angenommen „Urlaub Mallorca“ (12/30) und Enricos „Dienstreise Hamburg“ 30.11.–2.12. ohne Packliste · Dann steht unter „Kommend“ zuerst „Dienstreise Hamburg“, dann „Urlaub Mallorca“ mit Koffer-Symbol und „12/30 gepackt“ · Wenn ich eine antippe · Dann öffnet sich ihr Fenster über „Reisen“.
- AC-020 (leer): Haushalt „Test“ ohne Reisen → „Noch keine Reisen“, „Tragt Urlaub oder Dienstreisen ein, auch im Kalender durch Ziehen über die Tage.“ und „Reise eintragen“.

### Reise und geplante Gerichte (K-02)

Beispiel: Mo 30.11. abends „Lasagne“ (Enrico, Nadja, 2 Portionen, „Enrico kocht“), Di 1.12. abends
„Mango-Curry“ (Hähnchen 1 für Enrico, Tofu 1 für Nadja), Mi 2.12. mittags „Shakshuka“ (nur Enrico,
1 Portion), Mi 2.12. vormittags Aktivität „Eislaufen“; Liste offen: „Hackfleisch 250 g“ („Lasagne
(Mo)“), „Eier 3×“ („Shakshuka (Mi)“). _Gericht_ = Eintrag mit „Wer isst mit?“: Rezept, Sammlung,
Reste, Freitext, Restaurant; keine Aktivität.

**REQ-007 — Reisende aus geplanten Gerichten nehmen.** Nach jedem erfolgreichen Speichern einer
Reise nennt ein Dialog die Gerichte ab heute im Zeitraum, in denen eine Reisende mitisst
(„3 Gerichte im Zeitraum – Enrico rausnehmen?“, je Gericht eine angekreuzte Zeile, „Rausnehmen (3)“,
„So lassen“); „Rausnehmen“ entfernt die Personen aus „Wer isst mit?“ und „Wer kocht?“, senkt die
Portionen nach der Regel aus Spec 0021 REQ-006 (eine je Person in ihrer Variante; mindestens 1),
merkt ein Gericht ohne Esser und Gäste vor (Spec 0016, REQ-003; Zeile „danach vorgemerkt“) und
rechnet offene Posten der Einkaufsliste nach Spec 0021 REQ-007 neu bzw. nimmt die Beiträge eines
vorgemerkten Gerichts weg (Hinweis im Dialog „Die Einkaufsliste wird angepasst.“); danach 5 s „Rückgängig“ für alles,
die Reise bleibt. Quelle: K-02. Offline: nur online.

- AC-021: Wenn ich „Dienstreise Hamburg“ für Enrico 30.11.–2.12. speichere · Dann nennt der Dialog „Mo 30.11. · Abend · Lasagne“, „Di 1.12. · Abend · Mango-Curry“, „Mi 2.12. · Mittag · Shakshuka · danach vorgemerkt“, nicht „Eislaufen“ · Wenn „Rausnehmen (3)“ · Dann Lasagne: Nadja, 1 Portion, „Wer kocht?“ leer; Mango-Curry: Nadja, Tofu 1, Hähnchen entfällt; Shakshuka unter „Vorgemerkt“ (weiter Enrico, 1 Portion); Liste „Hackfleisch 125 g“, „Eier“ weg; Hinweis „Enrico aus 3 Gerichten genommen“ mit „Rückgängig“.
- AC-022: Wenn ich „Lasagne“ abwähle · Dann „Rausnehmen (2)“, Lasagne bleibt mit 2 Portionen; „Rückgängig“ stellt Mango-Curry und Shakshuka (Mi 2.12. mittags) wieder her, die Reise bleibt; „So lassen“ ändert nichts.
- AC-023: Angenommen Sa 5.12. „Lasagne“ (E, N), Fr 4.12. „Trattoria Da Enzo“ (E, N, 2 Gäste) · Wenn ich „Urlaub Mallorca“ speichere · Dann „2 Gerichte im Zeitraum – Enrico und Nadja rausnehmen?“; danach Lasagne vorgemerkt, Trattoria am 4.12. mit 2 Gästen ohne Esser.
- AC-024 (Rand): Angenommen Nadjas Reise 20.–24.11., heute eingetragen; Sa 21.11. „Mango-Curry“ mit Nadja, Mo 23.11. „Lasagne“ (N, E), Di 24.11. „Shakshuka“ nur Enrico · Dann nennt der Dialog nur „Mo 23.11. · Abend · Lasagne“; ohne betroffene Gerichte kein Dialog.
- AC-025 (Fehler): Nadja hat „Mango-Curry“ inzwischen gelöscht → die übrigen werden geändert, kein Fehler · Serverfehler → nichts geändert, „Hat nicht geklappt – bitte noch einmal versuchen“, Reise bleibt gespeichert.

**REQ-008 — Kürzen, Löschen, Abwählen nehmen niemanden zurück.** Kürzen, Löschen oder Abwählen
ändert keine Gerichte und bietet nichts an; Verlängern oder Hinzunehmen bietet nur die jetzt
betroffenen Gerichte an. Quelle: K-02. Offline: nur online.

- AC-026: Angenommen AC-021 ausgeführt · Wenn ich auf 30.11.–1.12. kürze und danach lösche · Dann kein Dialog, Shakshuka bleibt vorgemerkt, Lasagne und Mango-Curry weiter nur Nadja, kein Angebot zum Wiederaufnehmen.
- AC-027 (Rand): Angenommen Do 3.12. „Lasagne“ (E, N) · Wenn ich bis Do 3.12. verlängere · Dann „1 Gericht im Zeitraum – Enrico rausnehmen?“ nur mit „Do 3.12. · Abend · Lasagne“.

### Packliste

**REQ-009 — Packstück in der Packliste ändern.** Tipp auf den Namen (Desktop auch ⋯ →
„Bearbeiten“) öffnet das Fenster wie in der Reisetasche: „Name“, „Anzahl“ (leer, 1–99), „je Tag“
(mit Dauer der Reise), „Entfernen“, „Speichern“; aus einer bestehenden Reisetasche mit Schalter
„Auch in der Reisetasche „Strand“ ändern“ (aus), von Hand ergänzt mit „… speichern“; gepackt bleibt.
Quelle: T-01. Offline: nur online, keine neue Warteschlangen-Aktion; „Speichern“ und „Entfernen“
ausgegraut.

- AC-028: Angenommen „Socken 7×“ (1 je Tag) gepackt · Wenn Anzahl 2, „Speichern“ · Dann „Socken 14×“, weiter gepackt; Reisetasche „Strand“ weiter „Socken · 1 je Tag“.
- AC-029: Angenommen „Strand“ an „Urlaub Mallorca“ und „Sommerurlaub“, je „Badehose 2×“ · Wenn ich in „Urlaub Mallorca“ 3 setze mit „Auch in der Reisetasche „Strand“ ändern“ · Dann „Badehose 3×“ dort und in der Reisetasche, „Sommerurlaub“ weiter 2×.
- AC-030 (Fehler): Name leer → „Name fehlt“; „je Tag“ ohne Anzahl → Anzahl 1; inzwischen von Nadja entfernt → „Hat nicht geklappt – bitte noch einmal versuchen“, nach Abgleich weg; Nadja packt gleichzeitig → nach Umbenennen „Sneakersocken 7×“ gepackt.

**REQ-010 — „n je Tag“ erkennen.** Eine reine Funktion in `packages/core` liest eine Zeile als Name,
Anzahl, „je Tag“: Zahl 1–99 (wahlweise „×“/„x“) mit „je Tag“, „pro Tag“ oder „/Tag“ (Leerzeichen
um „/“ egal) am Ende oder um den Namen; ohne Zahl 1; Groß-/Kleinschreibung egal; feste Anzahl
(„2 Badehose“) bleibt. Gilt in der Reisetasche und bei „+ Packstück“. Quelle: T-04. Offline:
Erkennen vollständig, Speichern online.

| Erkannt                                                                                                                                                                                                                  | Nicht erkannt (alles bleibt Name)                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| „Unterhose 1 je Tag“, „Unterhose 1 pro Tag“, „Unterhose 1/Tag“ → Unterhose 1 je Tag; „Socken 2 / tag“, „Socken 2x je Tag“ → Socken 2 je Tag; „2 T-Shirts pro Tag“ → T-Shirts 2 je Tag; „Kontaktlinsen je Tag“ → 1 je Tag | „Tagesrucksack“, „Proviant für 2 Tage“, „Unterhose 0 je Tag“, „Unterhose 100 je Tag“, „Socken 1 je Woche“, „2 Socken 1 je Tag“ (zwei Zahlen), „je Tag“ (kein Name) |

- AC-031: In „Strand“ wird „Unterhose 1 je Tag“ + Enter zu „Unterhose · 1 je Tag“, „Proviant für 2 Tage“ bleibt ohne Anzahl.
- AC-032: In „Urlaub Mallorca“ (7 Tage) wird „+ Packstück“ „2 T-Shirts pro Tag“ zu „T-Shirts 14×“; mit „Auch in der Reisetasche speichern“ steht dort „T-Shirts · 2 je Tag“.
- AC-033 (Rand): Jede Eingabe beider Tabellenspalten ergibt genau das angegebene Ergebnis (Unit-Test je Zeile).

**REQ-011 — „Neue Reisetasche“ im Reise-Fenster.** „Reisetasche hinzufügen“ bietet oben „+ Neue
Reisetasche“; „Anlegen“ legt die leere Reisetasche an und hängt sie als Abschnitt an. Quelle: T-05.
Offline: nur online.

- AC-034: Wenn ich „+ Neue Reisetasche“ „Camping“ anlege · Dann gibt es die leere Reisetasche „Camping“ unter „Verwalten“ und am Ende der Packliste „Camping 0/0“ mit „+ Packstück“.
- AC-035 (Rand): „technik“ bei vorhandener, nicht angehängter „Technik“ → keine zweite, „Technik“ hängt mit 12 Packstücken an; „Strand“ schon angehängt → „Hängt schon an dieser Packliste“, nichts ändert sich.

### Reisetaschen und kommende Packlisten

_Kommend_ = Reise mit Bis ab heute.

**REQ-012 — Änderungen einer Reisetasche übernehmen.** Weicht eine kommende Packliste von einer
ihrer (noch bestehenden) Reisetaschen ab — _neu_ (Packstück ohne Gegenstück), _geändert_ (Name,
Anzahl oder „je Tag“), _entfernt_ (aus der Reisetasche gelöscht); von Hand Ergänztes zählt nie —,
zeigt die Seite der Reisetasche „Gilt nur für neue Packlisten. „Urlaub Mallorca“ (ab Fr 4.12.)
weicht ab: 1 neu, 1 geändert, 1 entfernt.“ mit „In „Urlaub Mallorca“ übernehmen“; ein Dialog zählt
auf („Neu: … Geändert: … Entfernt: … Bleibt, weil gepackt: …“), „Übernehmen“ hängt Neues offen ans
Ende, passt geänderte offene an, löscht entfernte offene; gepackte bleiben unverändert (Stand auf
dem Server beim Übernehmen); Name und „für“ der Tasche bleiben; 5 s „Rückgängig“. Quelle: T-02.
Offline: lesend, „Übernehmen“ ausgegraut.

- AC-036: Angenommen heute Mi 2.12. · Wenn ich „Sonnencreme“ in „Strand“ ergänze · Dann Hinweis „… weicht ab: 1 neu.“; nach „Übernehmen“ steht „Sonnencreme“ offen am Ende von „Strand“ („Strand 4/10“), der Hinweis ist weg.
- AC-037: Angenommen in der Packliste „Badehose 2×“ offen, „Schnorchel“ offen, „Socken 7×“ gepackt, von Hand „Kartenspiel“ · Wenn in der Reisetasche Badehose 3, Schnorchel entfernt, Socken 2 je Tag · Dann „1 geändert, 1 entfernt“, Dialog „Geändert: Badehose 3×. Entfernt: Schnorchel. Bleibt, weil gepackt: Socken.“; danach „Badehose 3×“, „Socken 7×“ gepackt, „Kartenspiel“, kein „Schnorchel“; „Rückgängig“ stellt alles her.
- AC-038 (Rand): Vergangene „Ostsee“ (Mai 2026) erscheint nie; offline ist der Knopf ausgegraut; packt Nadja „Badehose“ vor meiner Bestätigung, bleibt „Badehose 2×“ gepackt, der Rest wird übernommen.

**REQ-013 — „Kommende Packlisten“ auf „Reisetaschen“.** Oben auf „Reisetaschen“ eine Zeile je
kommender Reise mit Packliste (früheste zuerst, Titel, Zeitraum, Packstand, Avatare); ein Tipp
öffnet das Reise-Fenster über der Seite. Quelle: T-03. Offline: vollständig.

- AC-039: Angenommen „Urlaub Mallorca“ 12/30, „Dienstreise Hamburg“ 5/5, vergangene „Ostsee“ mit Packliste · Dann oben „Kommende Packlisten“: „Dienstreise Hamburg · Mo 30.11. – Mi 2.12. · alles gepackt ✓“, „Urlaub Mallorca · Fr 4.12. – Do 10.12. · 12/30 gepackt“, ohne „Ostsee“; Tipp öffnet das Fenster über „Reisetaschen“.
- AC-040 (Rand): Ohne kommende Packliste fehlt der Abschnitt.

### Begriff und Datenmodell

**REQ-014 — „Reise“ ist der eine Begriff.** Bezeichner, Dateien, Test-IDs, Adressen, Tabellen,
Spalten und Funktionen heißen `trip`/„Reise“; „Abwesenheit“, `absence`, „Urlaubsseite“ gibt es
nicht mehr. Quelle: ER-25. Offline: keine Änderung.

- AC-041: Ein Prüfskript über `apps/`, `packages/`, `supabase/functions/`, `supabase/tests/` und Seeds findet „absence“, „abwesen“, „urlaubsseite“ (ohne Groß-/Kleinschreibung) nicht; die Datenbank hat `trips`, `trip_members`, `packing_list_bags.trip_id`, keine `absences` (pgTAP `hasnt_table`).

**REQ-015 — Eine Reise mit ihren Personen, getrennt je Haushalt.** Eine Reise hat Zeitraum, Notiz und
mindestens eine Person ihres Haushalts; „Ganzer Haushalt“ = alle Mitglieder stehen darauf
(abgeleitet); nur Mitglieder sehen und ändern Reise, Personen, Packliste. Quelle: ER-25. Offline:
lesend.

- AC-042: Fremder Haushalt oder abgemeldet: Lesen, Anlegen, Ändern, Löschen von Reise, Personen, Taschen der Packliste, Packstücken abgelehnt; Enrico in eine fremde Reise oder eine fremde Tasche an „Urlaub Mallorca“ hängen abgelehnt.
- AC-043 (ungültig): Bis vor Von, keine Person, Person doppelt, Notiz über 500 Zeichen → abgelehnt, weder Reise noch Packliste; direktes Ändern von „gepackt“, „gepackt am“, „gepackt von“ abgelehnt (nur Packen, ADR-0013).
- AC-044: Wenn Nadja den Haushalt verlässt · Dann ist „Urlaub Mallorca“ eine Reise von Enrico mit unveränderter Packliste, ihr „Yoga-Wochenende“ (12.–13.12.) samt Packliste gelöscht, auch auf Enricos Gerät.
- AC-045: Wenn Vera beitritt · Dann zeigt „Urlaub Mallorca“ E- und N-Badge ohne Haus-Symbol, „Nur Enrico und Nadja“; am 5.12. ist Vera bei „Wer isst mit?“ vorgewählt und bekommt Benachrichtigungen, Enrico und Nadja nicht.

## Entscheidungen

Alle von Claude nach Enricos Regel „Empfehlung nehmen“, 22.11.2026.

1. **Datenmodell:** `trips` (eine Zeile je Reise) + `trip_members` statt `absences` (eine Zeile je
   Person, Streifen durch Gruppieren). Empfehlung: eine Reise = ein Streifen = eine Packliste; das
   Umhängen von Packlisten beim Bearbeiten entfällt. Folge: eine Reise des „ganzen Haushalts“ gilt
   nicht mehr für später Beigetretene (AC-045).
2. **Seite `/kalender/reise/<id>` entfällt** ohne Weiterleitung; das Fenster öffnet sich auf jeder
   Seite (Kalender, Übersicht, Reisen, Reisetaschen), Adresse nach Spec 0019. Kein Push-Link zeigt
   auf die Seite (geprüft: nur `/kalender?tag=…`).
3. **`/reisen` bleibt**: einziger Ort mit allen Reisen über Jahre und vergangenen Reisen, Einstieg
   unter „Verwalten“; bekommt Koffer-Symbol (T-03).
4. **Felder direkt im Fenster**, „Speichern“ nur bei Änderung, Fenster bleibt offen; Anlegen
   schließt. Empfehlung: Packen und Ändern in einem Fenster ohne ✎-Umweg.
5. **K-02 als Dialog nach dem Speichern** mit abwählbaren Zeilen; wer niemanden mehr hat, wird
   vorgemerkt statt gelöscht (nichts geht verloren); Einkaufsliste folgt sofort, weil der Dialog
   selbst die Rückfrage ist; Vergangenes und Aktivitäten bleiben unberührt.
6. **T-02 über Herkunftsverweis**: Packstücke der Packliste bekommen `bag_item_id` und `from_bag`;
   nur so sind „geändert“ und „entfernt“ eindeutig (Namensvergleich wäre unscharf).
7. **Offline:** Laden-Warteschlange unverändert (`pack`: Packen, Alles einpacken, Zurücksetzen).
   Nur online: Reise anlegen/ändern/löschen, Rausnehmen, Packstück ändern/ergänzen/entfernen, Tasche
   hinzufügen/entfernen, Neue Reisetasche, Übernehmen. Kein ADR-Nachtrag nötig.
8. **Ändert ältere AC:** Spec 0012 Nicht-Ziel „kein Ändern in der Packliste“ (→ REQ-009), AC-003
   (+ „je Tag“), AC-014/AC-045/Offene Frage 2 (getrennte Listen je Person → eine Liste je Reise),
   AC-016–AC-019, AC-044, AC-046 (Seite → Fenster), AC-038 (Löschen im Fenster), AC-039/Offene Frage
   4 (Umhängen entfällt); Spec 0016 AC-034 (Adresse) und Nicht-Ziel „Im Code bleibt `Absence`“;
   Spec 0010 D23 („alle gewählt = Haushalts-Abwesenheit“).
9. Abgestimmt mit Spec 0021, 22.11.2026: Portionen und Liste folgen deren Regeln (REQ-006,
   REQ-007). Anders als Vormerken von Hand (0021 Entscheidung 9, Beiträge bleiben) nimmt das
   Vormerken durch „Rausnehmen“ die Beiträge von der Liste — es isst ja niemand mehr mit.
10. Abgestimmt mit Spec 0026, 22.11.2026: Der Satz zur Wirkung einer Reise steht unter „Wer?“ beim
    Anlegen (REQ-003); die leere Seite „Reisen“ behält ihren Text (AC-020).
11. **Glossar** (Hauptsitzung): „Abwesenheit“ → „Reise“ (`Trip`, `trips`, `trip_members`);
    „Urlaubsseite“ → „Reise-Fenster“ (`TripWindow`); „Abwesenheits-Streifen“ → „Reise-Streifen“
    (`TripStripe`); „Kommende Packliste“ neu; „Packstück“ mit `bagItemId`.
12. **Beim Bau (Claude, 22.11.2026):** `trip_members` hat eine eigene `id` (PK) und
    `unique (household_id, trip_id, member_id)` statt des PK `trip_id+member_id`: so schreibt der
    allgemeine Diff-Weg (`apply_changes`, „Rückgängig“) Personen wie jede andere Zeile, ohne eigene
    RPC. „Mindestens eine Person“ prüft ein verzögerter Constraint-Trigger am Ende der Transaktion;
    das Entfernen der letzten Person wird abgelehnt, außer sie hat den Haushalt verlassen (dann
    geht die Reise samt Packliste). Bestehende Abwesenheiten werden in der Migration zu Reisen mit
    derselben id.
13. **Beim Bau:** Das Reise-Fenster steht als `?reise=<id>` in der Adresse der Seite, auf der es
    offen ist (Spec 0019 ist auf diesem Branch noch nicht gebaut; beim Zusammenführen auf deren
    Parameter-Schema umstellen).
14. **Beim Bau:** „Verlängern oder Hinzunehmen bietet nur die jetzt betroffenen Gerichte an“ heißt:
    nur Person-Tag-Paare, die vor dem Speichern nicht auf der Reise lagen; einmal mit „So lassen“
    abgelehnte Gerichte werden bei einer bloßen Notiz-Änderung nicht erneut angeboten.
15. **Beim Bau:** Portionen sinken nur bei Rezepten und Sammlungen (wie 0021 REQ-006); Freitext und
    Reste behalten ihre Portionen, Restaurants haben keine. Die Neuberechnung der Einkaufsliste
    (0021 REQ-007) ist in `core/trip-meals.ts` (`recomputeEntryContributions`) gebaut; 0021 soll
    sie beim Zusammenführen übernehmen oder ersetzen.
16. **Beim Bau:** Ein Tipp auf ein Packstück öffnet sein Fenster, das Kästchen packt (`CheckRow`
    `onPress`); zusätzlich ⋯ → „Bearbeiten“. `packing_items` bekommt neben `name, quantity, per_day`
    auch Update auf `bag_item_id, from_bag` („… in der Reisetasche speichern“ verknüpft das
    Packstück); die Gepackt-Spalten bleiben gesperrt.
17. **Beim Bau:** „Übernehmen“ ist die Domain-Op `adopt_bag_changes` von `apply_changes`; ihr
    „Rückgängig“ ist dieselbe Op umgekehrt (ein inzwischen Gepacktes bleibt auch dabei unberührt).

## Daten

- **Neu:** `trips` (id, household_id, from_on, to_on, note ≤ 500, check to_on ≥ from_on);
  `trip_members` (household_id, trip_id, member_id; PK trip_id+member_id; FK auf
  `household_members` on delete cascade; Trigger löscht die Reise, wenn die letzte Person geht). Je
  Tabelle RLS, Grants, Lösch-Trigger, `updated_at`, Sync, pgTAP-Isolation.
- **Geändert:** `packing_list_bags.absence_id` → `trip_id` (nicht mehr änderbar);
  `packing_items` + `bag_item_id` (FK `packing_bag_items`, on delete set null) + `from_bag boolean`,
  Update-Grant auf `name, quantity, per_day`, „je Tag“-Neuberechnung auch beim Update;
  `private.is_silent` liest `trip_members`; `apply_changes`-Liste angepasst.
- **Entfällt (für 0028):** Tabelle `absences`, Trigger `packing_list_bags_recalc` und Funktion
  `private.packing_list_bags_recalc`, Patch von `absence_id`; Code `planAbsenceWrite`,
  `moveListBags`, `DroppedPackingList`, `droppedPackingListMessage`, Gruppieren in `absenceStripes`,
  `tripStripe`, `TripScreen`, `trip-screen.tsx`, Route `kalender/reise/[id].tsx`, `TripPackingList`
  je Zeile („Packliste von …“), `useTripBack`/`?von=`, Feature-Ordner `absences/`, Hinweis „Wer weg
  ist, fehlt bei „Wer isst mit?“.“

## Risiken

| Risiko                                               | Gegenmaßnahme                                                  | Test                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Fremder Haushalt hängt Person/Tasche an fremde Reise | zusammengesetzte FKs mit `household_id`, RLS                   | pgTAP `trips.test.sql`, `domain_references` (AC-042)                               |
| Update-Grant öffnet Gepackt-Spalten                  | Column-Grant nur `name, quantity, per_day`                     | pgTAP `packing_list_edit.test.sql`, `trips.test.sql` (AC-043)                      |
| Offline-Pack-Einträge laufen ins Leere nach Umbau    | Warteschlange unverändert, fehlende Packstücke still verworfen | core `store-queue.test.ts`, api `backend.test.ts` (AC-024/AC-040 „Reise gelöscht“) |
| Übernehmen überschreibt Gepacktes                    | Server prüft `packed` beim Ausführen in einer Transaktion      | pgTAP `packing_list_edit.test.sql`, api `packing-edit.backend.test.ts` (AC-038)    |
| Rausnehmen halb ausgeführt                           | ein Aufruf für Plan und Liste, alles oder nichts               | api `commands-trips.backend.test.ts` (AC-025)                                      |
| Letzte Person geht, Reise bleibt ohne Person         | Trigger löscht Reise samt Packliste, Tombstones                | pgTAP `trips.test.sql`, `packing_tables.test.sql` (AC-044)                         |

## Umsetzung

- [x] 1. Migration `trips`, `trip_members`, Packlisten-Spalten, `is_silent`, `apply_changes`; pgTAP (AC-041–AC-045)
- [x] 2. core: `trips.ts` (Umbenennung, Streifen je Reise), `parsePackingLine` mit „je Tag“ (AC-031–AC-033), Rausnehmen-Plan (AC-021–AC-027), Abweichung Reisetasche (AC-036–AC-038)
- [x] 3. api: Befehle Reise speichern/ändern/löschen, Rausnehmen, Packstück ändern, Übernehmen; Umbenennung (AC-008–AC-018, AC-028–AC-030)
- [x] 4. app: Reise-Fenster ersetzt Seite und `AbsenceSheet`; Öffnen von allen Stellen; Route entfernt (AC-001–AC-018)
- [x] 5. app: K-02-Dialog (AC-021–AC-027); Packstück-Fenster, „Neue Reisetasche“ (AC-028–AC-035)
- [x] 6. app: „Reisen“-Zeilen, Hinweis auf Reisetasche, „Kommende Packlisten“ (AC-019, AC-020, AC-036–AC-040)
- [x] 7. Aufräumen nach „Entfällt“, Prüfskript (AC-041); `/security-check`
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` und `pnpm exec supabase test db`

### Nachweis (22.11.2026)

- `pnpm format:check && pnpm check` grün (core 1244, api 834 Tests, Skript-Test AC-041), `pnpm
build:web` grün, `pnpm exec supabase test db` über die Sperre: 37 Dateien, 2145 Tests, PASS;
  e2e nur typgeprüft (`rundgang-reise-fenster.spec.ts` neu).
- Security-Check (security-auditor) auf den Migrationen und Befehlen: keine Befunde, zwei Hinweise
  (`restore_packing_items` schreibt wie bisher den Packzustand nach ADR-0013;
  `adopt_bag_changes` ist für `authenticated` ausführbar, weil `apply_changes` als Invoker läuft).
- Offen: ✕ oben links auf dem Handy (AC-002, das gemeinsame `Sheet` hat ✕ rechts); der Satz zur
  Wirkung unter „Wer?“ kommt mit Spec 0026; die übrigen e2e-Rundgänge (Reisetaschen, Plan,
  Smoke) sind nur auf die neuen Test-IDs gebracht und laufen erst in 0028.
