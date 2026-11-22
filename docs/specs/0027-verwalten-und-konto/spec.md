---
status: freigegeben
datum: 2026-11-22
---

# 0027 — Verwalten und Konto: Einladungen, Profil, Haushalt, Benachrichtigungen

**Quelle:** V-02, V-03, V-04, V-05, V-08, V-09, V-10, V-11, X-08, X-09
(`docs/product/review-logik-und-bedienung.md`, Enricos Entscheidungen zu V-04 und X-08 vom
22.11.2026)

**Kritischer Pfad:** ja — Anmeldung (Zurückziehen ändert, wen `private.before_user_created_hook`
hereinlässt), RLS (Profil, Feedback, Aufgaben-Spalte), Löschen von Daten (Haushalt samt Fotos,
Einladungen, Feedback), Migrationen, Infrastruktur (Standard-Domain der Static Web Apps).

## Ziel

Wer den Haushalt verwaltet, kommt aus jeder Sackgasse heraus: Einladungen zurückziehen, das eigene
Profil ändern, den Haushalt umbenennen und als letztes Mitglied endgültig löschen, eigenes Feedback
korrigieren. Uhrzeiten wählt man in 5-Minuten-Schritten, Benachrichtigungen je Haushalt und je
Aufgabe, und „Zuletzt abgeglichen“ gleicht auf Tipp ab. Wer eingeladen wird, weiß, dass Enrico die
Adresse bei Google eintragen muss; alte `azurestaticapps.net`-Adressen leiten auf die eigene Domain um.

## Nicht-Ziele

- Kein Konto löschen: wer keinen Haushalt mehr hat, behält Konto und Profil.
- Keine Google-Anmeldung „In Production“ (Enricos Entscheidung zu X-08); die App prüft nicht, ob
  eine Adresse bei Google eingetragen ist.
- Keine Rollen im Haushalt; Löschen hängt an „letztes Mitglied“, nicht an einer Rolle.
- Keine Wirkung der Abneigungen auf Rezepte (keine Warnung), kein Status-Pflegen in der App, kein
  Ziehen zum Aktualisieren.

## Schon erledigt

Keiner der Punkte ist fertig (geprüft 22.11.2026). Vorhanden sind nur Teile:

- V-03: Rechte und RLS für `name`, `color`, `diet_preference`, `dislikes` der eigenen Zeile
  (`supabase/migrations/20261121062344_identity.sql`, `profiles_update`); keine Oberfläche.
- V-04: `households.name` ist für Mitglieder änderbar und steht in der Positivliste von
  `apply_changes` (`20261122143506_entry_reminders.sql`); keine Oberfläche.
- V-11: `pull` und `drain` gibt es in `packages/api/src/backend.ts`; die Zeile in
  `apps/app/src/features/settings/settings-screen.tsx` ist nur Text.
- X-09: nicht erledigt — `https://brave-bush-089e7a80f.6.azurestaticapps.net/` antwortet am
  22.11.2026 mit 200 statt umzuleiten.

## Anforderungen

Beispiel: Haushalt „Enrico & Nadja“ mit Enrico und Nadja, zweiter Haushalt „WG Köln“; heute ist
Sonntag, 22.11.2026.

### Einladungen

**REQ-001 — Einladung zurückziehen.** Jedes Mitglied zieht eine offene Einladung seines Haushalts
mit „Zurückziehen“ an der Zeile zurück, ohne Rückfrage; danach kann die Adresse über sie weder ein
Konto anlegen noch beitreten. Quelle: V-02. Offline: nur online, gesperrt mit Offline-Hinweis
(Spec 0019).

- AC-001: Angenommen „nadja@example.com“ ist eingeladen und hat kein Konto · Wenn Enrico
  „Zurückziehen“ wählt · Dann verschwindet die Zeile mit dem Hinweis „Einladung an
  nadja@example.com zurückgezogen“ · Und meldet Nadja sich danach bei Google an, entsteht kein Konto,
  und die Anmeldeseite zeigt „Diese Adresse ist nicht eingeladen. Bitte lass dich von jemandem aus
  deinem Haushalt einladen.“
- AC-002: Angenommen Nadja ist angemeldet und sieht auf „Willkommen“ die Einladung · Wenn Enrico sie
  zurückzieht · Dann ist sie nach Nadjas nächstem Abgleich weg, „Willkommen“ sagt „Du gehörst noch
  zu keinem Haushalt. Leg einen an oder lass dich einladen.“, ihr Konto bleibt und sieht keine Zeile
  von „Enrico & Nadja“ · Und wählt Nadja vorher noch „Annehmen“, wird sie nicht Mitglied und sieht
  „Diese Einladung gibt es nicht mehr.“
- AC-003: Angenommen Annehmen und Zurückziehen treffen gleichzeitig ein · Dann gewinnt, was der
  Server zuerst verarbeitet; die andere Seite sieht „Diese Einladung gibt es nicht mehr.“ und keine
  halbe Mitgliedschaft entsteht.
- AC-004: Angenommen eine Einladung von „WG Köln“, Nadja ist dort nicht Mitglied · Wenn Nadja sie
  über die API zurückziehen will, jemand ohne Anmeldung, oder Enrico eine unbekannte ID schickt ·
  Dann lehnt der Server ab („invitation_not_found“ bzw. nicht angemeldet), und nichts ändert sich.
- AC-005: Angenommen „tom@example.com“ ist zu „Enrico & Nadja“ und „WG Köln“ eingeladen · Wenn Enrico
  die erste zurückzieht · Dann kann Tom sich anmelden und sieht nur die Einladung zu „WG Köln“.

**REQ-002 — Hinweis auf die Google-Testnutzer.** Unter „Einladen“ steht, dass Enrico eine neue
Adresse zusätzlich bei Google eintragen muss und was sonst passiert; `betrieb.md` beschreibt den
Schritt. Quelle: X-08. Offline: Text, auch offline sichtbar.

- AC-006: Angenommen „Haushalt & Mitglieder“ ist offen · Dann steht unter dem Feld „Einladen“: „Ist
  die Adresse neu, muss Enrico sie zusätzlich bei Google als Testnutzer eintragen. Sonst zeigt Google
  beim Anmelden „Zugriff blockiert“.“ · Und nach dem Einladen sagt ein Hinweis „nadja@example.com ist
  eingeladen. Ist die Adresse neu: bei Google als Testnutzer eintragen.“ · Und der Satz „Wer
  eingeladen ist, kann sich mit Google anmelden.“ steht nirgends mehr.
- AC-007: Angenommen das Gerät ist offline · Dann stehen Offline-Hinweis und Google-Hinweis beide da.
- AC-008: Angenommen `docs/architecture/betrieb.md` · Dann gibt es „Neue Person einladen“ mit den
  Schritten (in der App einladen; Google Cloud Console → „Google Auth Platform“ → „Zielgruppe“ →
  „Testnutzer“ → Adresse hinzufügen, nur Enrico als Inhaber des Projekts; dann anmelden), was die
  Person ohne Eintrag sieht (Google-Seite „Zugriff blockiert“, „Fehler 403: access_denied“, die App
  erfährt nichts), dass späteres Eintragen genügt, und die Grenze von 100 Testnutzern.

### Profil

**REQ-003 — Eigenes Profil bearbeiten.** ✎ am Profil in den Einstellungen öffnet „Profil
bearbeiten“ mit „Name“ (1–80 Zeichen), „Farbe“ (eine der acht Avatar-Farben: Blau, Beere, Grün,
Kupfer, Violett, Petrol, Ocker, Rot), „Ernährung“ („isst alles“, „vegetarisch“, „vegan“) und
„Abneigungen“ (Chips, je 1–40 Zeichen, höchstens 50, ohne Doppelte nach Groß/Klein); die Adresse
steht nur zum Lesen da („Kommt von Google und lässt sich hier nicht ändern.“). Nur die Person selbst
ändert ihr Profil. Quelle: V-03 (Spec 0005, Offene Frage 2). Offline: nur online, ✎ gesperrt.

- AC-009: Angenommen Nadjas Profil „Nadja · nadja@example.com · Ernährung: isst alles“ · Wenn sie
  „Nadja K.“, „Petrol“, „vegetarisch“ und „Koriander“ einträgt und „Speichern“ wählt · Dann zeigt das
  Profil „Nadja K. · nadja@example.com · Ernährung: vegetarisch“ mit Avatar in Petrol · Und Enrico
  sieht nach dem Abgleich unter „Haushalt & Mitglieder“ „Nadja K.“ mit „vegetarisch · mag nicht:
  Koriander“ · Und in „Essen“ zeigt „Passt für alle“ die „Lasagne“ (mit Fleisch, ohne Variante) nicht
  mehr.
- AC-010: Angenommen „Profil bearbeiten“ ist offen · Wenn der Name leer ist und sie speichert · Dann
  wird nichts gespeichert, das Feld zeigt „Der Name fehlt.“ · Und „koriander“ neben „Koriander“ gibt
  keinen zweiten Chip · Und bei 50 Abneigungen ist „Abneigung hinzufügen“ gesperrt mit „Höchstens 50
  Abneigungen“.
- AC-011: Angenommen ungespeicherte Änderungen · Wenn sie mit ✕, Escape oder Android-Zurück schließt
  · Dann fragt die App „Änderungen verwerfen?“ mit „Verwerfen“ und „Weiter bearbeiten“; ohne Änderung
  schließt sie ohne Frage.
- AC-012: Angenommen Nadja und Enrico im selben Haushalt · Wenn Nadja über die API Enricos Profil,
  ihre eigene Adresse oder ID ändern will, einen leeren Namen, „#000000“, „pescetarisch“, eine
  41-Zeichen-Abneigung oder 51 Abneigungen schreibt, oder jemand ohne Anmeldung schreibt · Dann lehnt
  der Server ab bzw. ändert keine Zeile.
- AC-013: Angenommen beim „Speichern“ bricht das Netz ab · Dann bleibt das Fenster mit allen Eingaben
  offen, Hinweis „Nicht gespeichert – bitte mit Netz noch einmal versuchen.“

### Haushalt

**REQ-004 — Haushalt umbenennen.** ✎ neben dem Namen auf „Haushalt & Mitglieder“ öffnet „Haushalt
umbenennen“ (Feld „Name“, 1–80 Zeichen, Rand-Leerzeichen entfernt); jedes Mitglied darf das.
Quelle: V-04. Offline: nur online, ✎ gesperrt.

- AC-014: Angenommen Enrico auf „Haushalt & Mitglieder“ von „Enrico & Nadja“ · Wenn er „Kuschelnest“
  speichert · Dann heißt der Haushalt in Kopfzeile, „Haushalte“ und „Haushalt wechseln“ so, und auf
  Nadjas Gerät nach dem Abgleich ebenso.
- AC-015: Angenommen das Fenster ist offen · Wenn der Name leer oder nur Leerzeichen ist · Dann wird
  nichts gespeichert, „Der Name fehlt.“ · Und unverändert schließt „Speichern“ ohne Aufruf · Und
  „ Kuschelnest “ wird zu „Kuschelnest“.
- AC-016: Angenommen Nadja ist nicht Mitglied von „WG Köln“ · Wenn sie dessen Namen über die API
  ändern will · Dann lehnt der Server ab · Und benennen zwei Mitglieder gleichzeitig um, gilt der
  zuletzt angekommene Name auf beiden Geräten.

**REQ-005 — Haushalt löschen.** Wer als letztes Mitglied übrig ist, löscht den Haushalt in zwei
Schritten endgültig: alle Zeilen, alle Fotos, offene Einladungen, Benachrichtigungs-Einstellungen
und Zustell-Protokoll des Haushalts. Konto, Profil, andere Haushalte und Push-Abos („Deine Geräte“)
bleiben. Quelle: V-04 (Enricos Entscheidung). Offline: nur online, gesperrt.

```
MITGLIEDER
(E) Enrico (du)                      ← kein „Verlassen“ beim letzten Mitglied
✉ tom@example.com   Eingeladen   Zurückziehen
…
[ Haushalt löschen ]                 ← sonst: „Löschen kann den Haushalt nur, wer als Letztes übrig ist.“
```

- AC-017: Angenommen Enrico ist einziges Mitglied von „WG Köln“ · Dann steht unten „Haushalt
  löschen“ und an seiner Zeile kein „Verlassen“ · Und in „Enrico & Nadja“ (zwei Mitglieder) steht
  stattdessen „Löschen kann den Haushalt nur, wer als Letztes übrig ist.“
- AC-018: Wenn Enrico „Haushalt löschen“ wählt · Dann fragt „„WG Köln“ endgültig löschen?“ mit „Alles
  aus „WG Köln“ wird gelöscht: Rezepte, Kalender, Einkaufsliste, Artikel und Märkte, Aufgaben, Reisen
  und Reisetaschen, Restaurants, Aktivitäten, Feedback und alle Fotos. Das lässt sich nicht rückgängig
  machen.“ und „Die Einladung an tom@example.com verfällt.“ · Und „Endgültig löschen“ ist gesperrt,
  bis im Feld „Zum Bestätigen den Namen eingeben“ genau „WG Köln“ steht (Rand-Leerzeichen egal,
  Groß/Klein nicht; „wg köln“ reicht nicht) · Und „Abbrechen“, Escape, Android-Zurück löschen nichts.
- AC-019: Angenommen „WG Köln“ hat 3 Rezepte und 1 Aktivität mit Foto und Zeilen in allen Tabellen ·
  Wenn er bestätigt · Dann zeigt der Knopf „Wird gelöscht …“ (Fenster nicht schließbar), danach zeigt
  die App „Enrico & Nadja“ mit „„WG Köln“ ist gelöscht“ · Und am Server gibt es keine Zeile mit der ID
  von „WG Köln“, auch nicht in `deleted_records`, und kein Objekt unter ihrem Foto-Ordner · Und das
  Gerät hält weder Daten noch Fotos davon · Und war es sein einziger Haushalt, zeigt die App
  „Willkommen“.
- AC-020: Angenommen Enricos Laptop hält „WG Köln“ mit 2 offline gepackten Packstücken in der
  Laden-Warteschlange · Wenn er abgleicht · Dann verschwindet „WG Köln“ samt Fotos, die 2 Einträge
  werden verworfen, ohne andere aufzuhalten · Und Tom sieht keine Einladung mehr und kommt über sie
  nicht hinein · Und aus „WG Köln“ kommt keine Nachricht mehr, „Deine Geräte“ und Nachrichten aus
  „Enrico & Nadja“ bleiben.
- AC-021: Angenommen „Enrico & Nadja“ hat zwei Mitglieder · Wenn Enrico es über die API löschen will
  · Dann „not_last_member“ · Und Tom (fremd) „not_member“, ohne Anmeldung abgelehnt, ein wiederholter
  Aufruf nach dem Löschen „not_member“, ein Aufruf, solange Fotos des Haushalts im Speicher liegen,
  „media_remaining“ — jeweils wird nichts gelöscht.
- AC-022: Angenommen das Fenster ist offen und Tom nimmt gerade seine Einladung an · Wenn Enrico danach
  bestätigt · Dann wird nichts gelöscht, auch kein Foto, das Fenster schließt mit „Inzwischen ist noch
  jemand Mitglied. Löschen geht nur als letztes Mitglied.“
- AC-023: Angenommen das Netz bricht ab, nachdem ein Teil der Fotos gelöscht ist, oder der letzte
  Serverschritt schlägt fehl · Dann gibt es „WG Köln“ weiter mit allen Zeilen (schon gelöschte Fotos
  fehlen), Hinweis „Löschen nicht abgeschlossen – „WG Köln“ ist noch da. Bitte mit Netz noch einmal
  löschen.“ · Und ein zweiter Versuch löscht vollständig wie AC-019.
- AC-024: Angenommen offline · Dann sind „Haushalt löschen“ und „Endgültig löschen“ gesperrt mit
  Offline-Hinweis.

### Feedback

**REQ-006 — Eigenes Feedback bearbeiten und löschen.** An eigenen Einträgen hat ⋯ „Bearbeiten“
(nur solange der Status „neu“ ist; Fenster „Feedback bearbeiten“ mit Art und Text) und „Löschen“
(immer, mit Rückfrage); über den Filtern steht ein Satz zum Status. Quelle: V-05. Offline: nur
online, gesperrt.

- AC-025: Angenommen Enricos „Idee: Einkaufsliste nach Markt sortieren“, Status „neu“, „+1“ von Nadja
  · Wenn er den Text in „Einkaufsliste nach Laufreihenfolge sortieren“ ändert und speichert · Dann
  zeigt der Eintrag ihn, Art, Datum und „+1 · 1“ bleiben · Und leerer Text lässt sich nicht speichern
  („Schreib zuerst, worum es geht“).
- AC-026: Wenn er ⋯ → „Löschen“ wählt · Dann fragt „Feedback löschen?“ mit „Das „+1“ von Nadja geht
  mit.“ (ohne „+1“ nur die Frage) · Und nach „Löschen“ ist der Eintrag bei beiden weg.
- AC-027: Angenommen Nadjas Eintrag und Enricos „angenommener“ Eintrag · Dann hat Nadjas bei Enrico
  kein ⋯, sein angenommener nur „Löschen“ · Und über die API lehnt der Server ab: fremdes Feedback
  ändern oder löschen, Text eines nicht mehr neuen ändern, Status, Begründung oder Spec-Verweis setzen
  (auch beim eigenen), jede Änderung ohne Anmeldung.
- AC-028: Angenommen „Feedback“ ist offen · Dann steht über den Filtern „Den Status setzt der
  Entwickler der App, wenn er ein Feedback bearbeitet hat.“

### Benachrichtigungen und Uhrzeiten

**REQ-007 — Uhrzeit-Auswahl in 5-Minuten-Schritten.** Jede Uhrzeit wählt man aus „Stunde“ (0–23)
und „Minute“ (00, 05, … 55): Tagesüberblick und Aktivitäten am Vortag („Uhrzeit“, Pflicht),
Aufgabe („Uhrzeit (optional)“, ✕), Restaurant- und Aktivitäts-Eintrag („Uhrzeit (optional)“, ✕
entfernt sie; Spec 0021 REQ-013, auch im Hinzufügen- und Einplanen-Fenster), Erinnerung am Eintrag
(Spec 0017, Pflicht). Wann gespeichert wird, bleibt je Stelle;
eine Wahl zählt als abgeschlossene Eingabe. Quelle: V-08 (Spec 0013, Offene Frage 5). Offline: wie
die Stelle — gesperrt.

- AC-029: Angenommen Tagesüberblick 7:30 · Dann zeigen die Felder „7“ und „30“, „Minute“ bietet genau
  die 12 Werte, „Stunde“ genau 0–23 · Wenn Nadja „6“ und „45“ wählt und speichert · Dann steht „6:45“
  da · Und „Bitte in 5-Minuten-Schritten“ erscheint nirgends mehr.
- AC-030: Angenommen „Bad putzen“ ohne Uhrzeit · Dann zeigen beide „–“, „Minute“ ist gesperrt, ✕ fehlt
  · Wenn Enrico „19“ wählt · Dann steht 19:00, „Minute“ ist bedienbar, ✕ erscheint · Und ✕ entfernt
  die Uhrzeit.
- AC-031: Angenommen Desktop, „Uhrzeit (optional)“ am Eintrag „Trattoria Da Enzo“ · Wenn Enrico mit
  Tab zu „Stunde“, „19“ tippt, Tab, „3“ tippt · Dann steht 19:30, Pfeiltasten wechseln den Wert, ein
  Screenreader liest „Uhrzeit, Stunde, 19“ · Und auf dem iPhone öffnet ein Tipp das Auswahlrad des Systems.

**REQ-008 — Haushalt auf „Benachrichtigungen“ wählen.** Wer in mehreren Haushalten ist, wählt über
„Was und wann“, für welchen Haushalt die Einstellungen gelten, ohne den Haushalt der App zu wechseln;
die Wahl steht als `fuer-haushalt` in der Adresse (Anhang Spec 0019; wechselt nie den Haushalt der
App). Quelle: V-09 (Spec 0013, Offene Frage 3e). Offline:
lesend (alle eigenen Haushalte liegen im lokalen Speicher), ändern nur online.

- AC-032: Angenommen Enrico in „Enrico & Nadja“ (aktiv, Tagesüberblick aus) und „WG Köln“
  (Tagesüberblick an) · Dann steht die Auswahl „Enrico & Nadja“ · „WG Köln“ mit dem aktiven gewählt,
  darunter „Gilt für „Enrico & Nadja“ auf allen deinen Geräten.“ · Wenn er „WG Köln“ wählt · Dann
  steht der Tagesüberblick auf an, die App bleibt sonst in „Enrico & Nadja“, und ein Schalter ändert
  nur die Zeile von „WG Köln“.
- AC-033: Angenommen Nadja hat nur einen Haushalt · Dann gibt es weder Auswahl noch Haushaltsnamen ·
  Und „Dieses Gerät“ und „Deine Geräte“ stehen außerhalb der Auswahl.
- AC-034: Angenommen die Adresse nennt einen fremden oder unbekannten Haushalt · Dann ist der aktive
  gewählt, und nichts Fremdes wird gelesen oder geschrieben.

**REQ-009 — „Erinnern“ je Aufgabe.** Eine Aufgabe mit Uhrzeit hat den Schalter „Erinnern“ (gilt für
den Haushalt, neu an); ist er aus, erinnert der Zeitplaner niemanden, die Uhrzeit wird nur angezeigt.
Die persönliche Einstellung „Aufgaben mit Uhrzeit“ bleibt; eine Erinnerung kommt nur, wenn beide an
sind. Quelle: V-10 (Spec 0013, Offene Frage 3d). Offline: nur online, wie Aufgabe bearbeiten.

- AC-035: Angenommen „Müll rausbringen“ ohne Uhrzeit · Dann gibt es kein „Erinnern“ · Wenn Enrico 19:00
  wählt · Dann erscheint „Erinnern“ an mit „Erinnert zur Uhrzeit, wer dran ist.“ · Wenn er es
  ausschaltet und speichert · Dann steht „Keine Erinnerung – die Uhrzeit wird nur angezeigt.“, „Zu tun“
  zeigt weiter „Müll rausbringen · 19:00“, und Nadja sieht „Erinnern“ aus.
- AC-036: Angenommen fällig 22.11. 19:00, Enrico dran, beide „Aufgaben mit Uhrzeit“ an, „Erinnern“ aus
  · Wenn der Takt um 19:00 läuft · Dann bekommt niemand eine Nachricht, der Tagesüberblick nennt die
  Aufgabe weiter · Und mit „Erinnern“ an kommt „Müll rausbringen · 19:00 · du bist dran“ (Spec 0013,
  AC-023).
- AC-037: Angenommen Enricos „Aufgaben mit Uhrzeit“ ist aus · Dann steht unter „Erinnern“ zusätzlich
  „Du selbst bekommst keine: „Aufgaben mit Uhrzeit“ ist in deinen Benachrichtigungen aus.“
- AC-038: Angenommen 19:00 mit „Erinnern“ aus · Wenn Enrico die Uhrzeit entfernt, speichert und später
  18:00 wählt · Dann ist „Erinnern“ wieder an · Und über die API lehnt der Server „Erinnern“ aus ohne
  Uhrzeit ab, ebenso jede Änderung aus einem fremden Haushalt.

### Abgleich

**REQ-010 — „Jetzt abgleichen“.** Die Zeile „Zuletzt abgeglichen“ im Profil der Einstellungen ist
ein Knopf: Er sendet, was in der Laden-Warteschlange wartet, und holt dann den neuesten Stand.
Quelle: V-11. Offline: gesperrt mit Offline-Hinweis; mit Netz gleicht die App ohnehin von selbst ab.

- AC-039: Angenommen „Zuletzt abgeglichen: heute, 16:58 · Jetzt abgleichen“, Nadja hat gerade
  „Mango-Curry“ für Montag eingeplant · Wenn Enrico um 17:04 tippt · Dann steht „Wird abgeglichen …“
  (ein zweiter Tipp startet nichts), danach „Zuletzt abgeglichen: heute, 17:04 · Jetzt abgleichen“,
  und sein Kalender zeigt „Mango-Curry“ · Und der Screenreader-Name ist „Jetzt abgleichen, zuletzt
  abgeglichen heute, 16:58“.
- AC-040: Angenommen 3 offline gesetzte Haken warten · Wenn er tippt · Dann gehen sie vor dem Holen
  an den Server.
- AC-041: Angenommen der Server antwortet mit Fehler · Dann „Abgleich hat nicht geklappt – bitte
  später noch einmal versuchen.“ und die alte Zeit bleibt · Und nie abgeglichen zeigt „Noch nicht
  abgeglichen · Jetzt abgleichen“ · Und offline ist die Zeile gesperrt.

### Adressen

**REQ-011 — Alte Adressen leiten um.** In beiden Static Web Apps (`swa-housekeeping-app-prd` →
`house.kuschel-nest.de`, `swa-housekeeping-app-preview` → `test.house.kuschel-nest.de`) ist die
eigene Domain Standard, sodass die `azurestaticapps.net`-Adresse umleitet; jede Auslieferung prüft
das. Quelle: X-09. Offline: —.

- AC-042: Angenommen die Domain ist Standard · Wenn jemand
  `https://brave-bush-089e7a80f.6.azurestaticapps.net/kalender` aufruft · Dann antwortet Azure mit
  301 oder 308 auf `https://house.kuschel-nest.de/kalender` · Und die alte Vorschau-Adresse leitet auf
  `https://test.house.kuschel-nest.de` um · Und die eigenen Domains antworten mit 200.
- AC-043: Angenommen ein Lauf von Veröffentlichung, Vorschau oder erneuter Web-Auslieferung · Wenn die
  alte Adresse mit 200 antwortet · Dann ist der Lauf rot mit „Alte Adresse leitet nicht um“.
- AC-044: Angenommen `docs/architecture/betrieb.md` · Dann nennt „Stand der Einrichtung“ die eigenen
  Domains als Web-Adressen und die alten als „leitet um“, ein Abschnitt beschreibt „Als Standard
  festlegen“ und den Prüfbefehl (`curl -sI`), und kein Befehl gibt ein Secret aus.

## Entscheidungen

Alle `ENTSCHIEDEN` von Claude nach Enricos Regel „Empfehlung nehmen“, 22.11.2026.

1. Eine Einladung lebt nur, solange sie offen ist: `accept_invitation` löscht sie, `accepted_at`
   entfällt; Zurückziehen = löschen. Empfehlung, weil es keinen Zustand „angenommen“ mehr zu
   bedenken gibt (Hook, Policies, Zurückziehen). Ändert Spec 0003, AC-008 nicht im Ergebnis.
2. Zurückziehen ohne Rückfrage und ohne „Rückgängig“: erneutes Einladen ist ein Schritt. Ein schon
   angelegtes Konto bleibt (Kontolöschen ist Nicht-Ziel); es sieht keine Daten und kann wie bisher
   selbst einen Haushalt anlegen (Spec 0003).
3. Haushalt löschen: erst löscht die App alle Objekte unter `<household_id>/` im Foto-Speicher, dann
   löscht `delete_household` in einer Transaktion und lehnt mit `media_remaining` ab, solange noch
   Objekte da sind. Empfehlung statt Edge Function mit `service_role`: kein neuer privilegierter
   Baustein, und es bleibt nie ein gelöschter Haushalt mit verwaisten Fotos. Rest-Risiko: ein Upload
   genau zwischen Prüfung und Commit (Risiken).
4. Zweiter Schritt beim Löschen = Namen eintippen (statt zweitem Fenster oder Häkchen): nennt den
   Haushalt und verhindert Fehltipps. Hinweis zu Sicherungen nicht im Fenster, nur unter „Daten“.
5. „Erinnern“ ist eine Spalte der Aufgabe (für alle im Haushalt), nicht je Person: die Uhrzeit ist
   auch Haushaltssache; die persönliche Einstellung bleibt der Schalter je Person.
6. Uhrzeit-Auswahl als zwei native Auswahlfelder statt Textfeld oder `<input type="time">`: iPhone
   bekommt das Systemrad, Tastatur und Screenreader gehen ohne Sonderbau, und iOS ignoriert `step`.
   Ersetzt Spec 0013, Plan-Entscheidung 27 („Uhrzeit eintippen“); `TimeField` gilt dann überall,
   auch für Specs 0021 und 0024 (0026 bringt kein eigenes Uhrzeitfeld). Abgestimmt mit Spec 0021,
   22.11.2026: „Reserviert um“ heißt dort „Uhrzeit (optional)“ und gilt für Restaurant und
   Aktivität; Tipp-Fehlermeldungen entfallen auch dort.
7. Der Haushaltsumschalter auf „Benachrichtigungen“ wechselt nicht den Haushalt der App; der Zähler
   „2 an“ der Einstellungszeile bleibt der des aktiven Haushalts. Ersetzt den Titel „Was und wann ·
   <Haushalt>“ aus Spec 0013 (`kindsSectionTitle`).
8. Abneigungen bleiben (Empfehlung des Reviews) und werden sichtbar: im Profil und unter „Haushalt &
   Mitglieder“ („mag nicht: …“). Eine Wirkung auf Rezepte ist Nicht-Ziel. Alternative wäre, die
   ungenutzte Spalte zu streichen.
9. Profilfarbe nur aus der festen Acht-Farben-Palette, in der Datenbank erzwungen; die Palette steht
   einmal in `packages/core` und gleich in SQL (`private.profile_color`), ein Test hält beide gleich.
10. Feedback: Bearbeiten nur bei Status „neu“, Löschen eigener immer; Status, Begründung und
    Spec-Verweis setzt nur der Entwickler direkt in der Datenbank. UI-Satz ohne Personennamen.
11. Google-Hinweis steht unter dem Feld „Einladen“; ein eigenes Fenster „Einladen“ gibt es nicht und
    wird nicht gebaut. Der Hinweis nennt Enrico, weil nur er das Google-Projekt verwaltet.
12. X-09 per Azure-Portal („Benutzerdefinierte Domänen“ → Domain → „Als Standard festlegen“); `az
staticwebapp hostname` kennt kein „Standard setzen“. Durchführen: Enrico (Portal), außer ein
    belegter `az rest`-Aufruf findet sich beim Bauen. Supabase lässt schon nur die eigenen Domains
    als Rücksprung zu (`supabase/config.toml`).
13. Ersetzt: Spec 0003 „Haushalte werden nie über die API gelöscht“ (Kommentar `households_select`)
    und „Wer eingeladen ist, kann sich mit Google anmelden“; Spec 0013 AC-022 (Hinweis unter der
    Uhrzeit, jetzt AC-035/AC-037); Spec 0005 Offene Frage 2 ist mit REQ-003 erledigt.

## Daten

- `household_invitations`: ohne `accepted_at`; der Index auf `email` gilt für alle Zeilen; Hook und
  `households_select` prüfen nur noch „Einladung zur Adresse existiert“.
- Neue RPCs (security definer, Wrapper in `public`): `withdraw_invitation(invitation_id)`,
  `update_profile(name, color, diet_preference, dislikes)` (nur eigene Zeile),
  `delete_household(household_id)` (sperrt die Zeile, prüft Mitglied, letztes Mitglied, keine
  Foto-Objekte; löscht den Haushalt per Kaskade und die `deleted_records` des Haushalts), dazu
  `household_media_names(household_id)` (security invoker, Namen aus `storage.objects` unter dem
  Präfix, für die App). Der Foto-Prüfpräfix gilt für jeden Unterordner (auch Restaurants, Spec 0024).
- `profiles`: `color` nur aus der Palette (Check), Abneigungen je 1–40 Zeichen getrimmt (Check).
- `feedback`: Update- und Delete-Policy nur für `author_id = auth.uid()`, Update zusätzlich nur bei
  `status = 'new'`; Grants und `apply_changes`-Positivliste nur noch `kind`, `text` (Update) bzw.
  ohne `status`, `reason`, `spec_ref` (Insert).
- `chores`: neue Spalte `remind_at_due_time boolean not null default true`, Check `due_time is not
null or remind_at_due_time`; in `apply_changes` und `private.chore_reminder_candidates`.
- Sicherungen enthalten einen gelöschten Haushalt noch bis zu 31 Tage (täglich) bzw. 366 Tage
  (monatlich, `betrieb.md`).
- Entfällt: `household_invitations.accepted_at`, das Wiedereröffnen angenommener Einladungen in
  `invite_member`, `profiles`-Spalten-Grant für direktes Update (geht über `update_profile`),
  `feedback`-Grants auf `status`, `reason`, `spec_ref`; im Code `parseTimeInput` (Tipp-Formate),
  `TIME_ERRORS`, `timeFieldA11yValue`, `kindsSectionTitle`, `choreTimeHint` in alter Form.

## Risiken

| Risiko                                                                                      | Gegenmaßnahme                                                                                         | Test                                   |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Fremder löscht einen Haushalt oder zieht eine Einladung zurück                              | RPC prüft Mitgliedschaft über `auth.uid()`; fremde IDs → `not_member` bzw. `invitation_not_found`     | pgTAP AC-004, AC-021                   |
| Nicht-letztes Mitglied löscht; Beitritt während des Löschens                                | `for update` auf `households`, Zählung unter der Sperre; `accept_invitation` sperrt dieselbe Zeile    | pgTAP AC-021, AC-022 (zwei Sitzungen)  |
| Abgemeldet / Wiederholung                                                                   | kein `anon`-Grant; zweiter Aufruf trifft keinen Haushalt mehr → `not_member`                          | pgTAP AC-021                           |
| Teilfehler Datenbank ↔ Foto-Speicher                                                        | Fotos zuerst, Datenbank lehnt mit `media_remaining` ab; Wiederholen ist sicher                        | pgTAP `media_remaining`, vitest AC-023 |
| Upload zwischen Foto-Prüfung und Commit                                                     | Upload braucht Mitgliedschaft, nach Commit unmöglich; Fenster eines Wimpernschlags, nur eigene Geräte | in Risiken vermerkt                    |
| Kaskade scheitert an zusammengesetzten Fremdschlüsseln (`set null` auf `household_members`) | pgTAP mit voll befülltem Haushalt aller Tabellen                                                      | pgTAP AC-019                           |
| Profil, Feedback oder Aufgabe einer anderen Person ändern                                   | RLS eigene Zeile bzw. Autor; Checks für Farbe, Länge, Anzahl                                          | pgTAP AC-012, AC-027, AC-038           |
| Zurückgezogene Adresse kommt doch herein                                                    | Hook prüft nur existierende Einladungen                                                               | pgTAP `auth.test.sql` AC-001, AC-005   |
| Andere Geräte behalten Daten oder Warteschlange blockiert                                   | `applyMemberships` und `dropMediaOutside`; dauerhafte Fehler werden verworfen                         | vitest AC-020                          |

## Umsetzung

- [ ] 1. Migration Einladungen: `accepted_at` weg, `accept_invitation` löscht, `withdraw_invitation`,
      Hook angepasst; pgTAP rot→grün; Oberfläche „Zurückziehen“ (AC-001–AC-005)
- [ ] 2. Google-Hinweis unter „Einladen“ und Abschnitt „Neue Person einladen“ in `betrieb.md`
      (AC-006–AC-008)
- [ ] 3. Profil: Palette in core, `update_profile`, Checks, Fenster „Profil bearbeiten“,
      Abneigungen in der Mitgliederliste (AC-009–AC-013)
- [ ] 4. Umbenennen-Fenster (AC-014–AC-016)
- [ ] 5. `delete_household`, `household_media_names`, App-Ablauf Fotos → RPC, Fenster mit
      Namensbestätigung; Bedrohungstabelle als pgTAP und vitest (AC-017–AC-024)
- [ ] 6. Feedback: Policies und Grants, ⋯ mit Bearbeiten und Löschen, Status-Satz (AC-025–AC-028)
- [ ] 7. `TimeField` als Auswahl in `packages/ui`, an allen vier Stellen; tote Tipp-Logik entfernen
      (AC-029–AC-031)
- [ ] 8. Haushaltsauswahl auf „Benachrichtigungen“ (AC-032–AC-034)
- [ ] 9. Nach Spec 0026: `chores.remind_at_due_time`, Zeitplaner, Schalter im Formular
      (AC-035–AC-038)
- [ ] 10. `syncNow` in `packages/api` (drain, dann pull), Zeile als Knopf (AC-039–AC-041)
- [ ] 11. Azure: Domain als Standard (Enrico), Umleitungs-Prüfung in `scripts/release/verify.mjs`
      und den drei Workflows, `betrieb.md` (AC-042–AC-044)
- [ ] `/security-check` auf den Diff (kritischer Pfad), Glossar: „Erinnern“ an „Uhrzeit (Aufgabe)“,
      „Einladung“ ohne Zustand „angenommen“
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` und `pnpm exec supabase test db`
