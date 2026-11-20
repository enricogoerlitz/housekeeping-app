---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-20
---

# 0006 — Eine Einkaufsliste

## Problem

Enrico und Nadja kaufen für einen Haushalt ein und denken dabei an genau eine Liste. Die App
erlaubt aber mehrere Listen, eine davon heißt „Standardliste“; man wechselt über einen Pfeil, und
jede Liste hat ihren eigenen Markt. So landen Posten in der falschen Liste, und „Drogerie“ muss man
getrennt abarbeiten. Auf der Seite „Liste“ kann man nur abhaken, nicht bearbeiten: keine Menge
ändern, keinen Zusatz korrigieren, nichts entfernen, nicht leeren. Enrico konnte dort außerdem
keine Einträge hinzufügen. „Auf die Einkaufsliste“ streicht ausgerechnet durch, was mitkommen soll,
und kennt nur die aktuelle Woche. Im Laden lässt sich der Markt nicht dort wählen, wo man ihn
braucht.

## Ziel

- Jeder Haushalt hat genau eine Einkaufsliste. Was in weiteren Listen offen war, steht danach in
  ihr; nichts Offenes geht verloren.
- „Liste“ ist zum Bearbeiten da: Menge mit + und −, Zusatz, Bereich, entfernen, hinzufügen und
  leeren mit Bestätigung. Abgehakt wird beim Einkaufen.
- „Einkaufen“ zeigt oben den Markt; vorausgewählt ist der, den man auf diesem Gerät zuletzt gewählt
  hat, sonst der Standardmarkt.
- „Auf die Einkaufsliste“ wählt Einträge aus beliebigen Wochen; vorausgewählt ist, was ab heute bis
  Ende der Woche ansteht und noch nicht auf der Liste steht. Im Vorratscheck sieht Ausgewähltes
  normal aus.
- Ein Test gegen das echte Backend zeigt, dass Hinzufügen funktioniert (Rückfrage F1).

## Nicht-Ziele

- **Keine Sammlungen.** Sie kommen mit Spec 0009 in „Auf die Einkaufsliste“ und den Vorratscheck;
  diese Spec zeigt Rezepte (was 0009 ergänzt, steht unter „Konzept in Kürze“).
- **Kein Abhaken auf „Liste“** (D24). Online Gekauftes, das man zuhause bekommt, wird entfernt.
- **Keine Verwaltung von Artikeln, Märkten und Bereichen.** Die Seiten baut Spec 0007; hier gibt es
  nur die Wege dorthin.
- **Keine neue Offline-Aktion.** Offline bleiben es die vier Laden-Aktionen (ADR-0008 Nachtrag).
- **Keine Dauerposten** und keine KI (Spracheingabe und Vorschlagszeilen bleiben ausgeblendet, Spec
  0005).
- **Kein Neubau der Rezeptseite.** Diese Spec setzt nur „Auf die Liste“ hinein; die Seite gestaltet
  Spec 0008.

## Konzept in Kürze

Grundlage ist das freigegebene UI-Konzept v2 (`docs/product/ui-konzept-v2.md`), Abschnitte 3.5
(„Auf die Einkaufsliste“ neu), 3.7, 3.8, 4.1 und 4.7, mit den Entscheidungen D21, D24, D25 und D26
(alle ENTSCHIEDEN) und der Rückfrage F1.

- **Eine Liste (D25).** Der Titel heißt „Einkaufsliste“. Kein Pfeil zum Wechseln, kein „Neue
  Liste“, keine „Standardliste“. Die Umstellung läuft in drei Schritten (erweitern → umziehen →
  aufräumen):
  1. Eine Migration führt je Haushalt alle Listen in die bisherige Standardliste zusammen. Offene
     Posten ziehen um und behalten ihre Kennung. Steht derselbe Artikel schon offen in der
     Standardliste, werden beide zu einem Posten; jeder Beitrag (Herkunft, Menge, Zusatz) bleibt
     einzeln erhalten. Abgehakte Posten weiterer Listen werden gelöscht, sie waren erledigt. Die
     weiteren Listen verschwinden.
  2. Ab dann sichert die Datenbank „höchstens eine Liste je Haushalt“.
  3. Der Markt an der Liste wird nicht mehr gelesen und später entfernt. Die App lädt mit einer
     neuen Speicher-Version einmal alles neu.
- **„Liste“ bearbeitet (D24).** Zeile: Artikel mit Zusatz in Klammern, rechts „− 2× +“ bei
  Anzahlen, bei Mengen „500 g ›“. Antippen öffnet „Posten bearbeiten“ (mittleres Fenster), nach
  links wischen entfernt mit 5 s „Rückgängig“. Oben „Einkaufen“ und „+ Aus Kalender …“, unten die
  Eingabezeile „Was fehlt?“, im Kopf ⋯ mit „Erledigt leeren“, „Liste leeren …“, „Märkte & Bereiche“
  und „Artikel“. „Erledigt“ steht eingeklappt unten. Die Bereiche stehen in ihrer Reihenfolge ohne
  Markt, denn der Markt zählt nur noch beim Einkaufen.
- **„Einkaufen“ (D26)** ist Vollbild (Spec 0005, D5). Oben der Chip mit dem Markt; er öffnet das
  kleine Fenster „Wo kaufst du ein?“. Abhaken mit Sammel-Fenster (Spec 0005, REQ-005): Der Haken
  geht sofort beim Tipp an den Server bzw. in die Laden-Warteschlange („Abhaken gewinnt“ bleibt),
  2 s nach dem letzten Tipp gleiten die Zeilen nach „Im Wagen“. Wie bisher: Fortschritt, Gruppen in
  der Laufreihenfolge, „Woanders kaufen“, „Ohne Bereich“ mit „Bereich zuordnen“, „Im Wagen (n)“
  eingeklappt, Posten hinzufügen auch offline, „Fertig“ mit „8 gekauft · 2 bleiben“.
- **„Auf die Einkaufsliste“ (D21)** in einem großen Fenster mit zwei Schritten. Schritt 1 „Was soll
  auf die Liste?“: ‹ › blättert durch Wochen, gewählt werden Einträge, ein Tipp auf den Tag wählt
  alle seine Einträge; Restaurants und Aktivitäten fehlen; „Vorgemerkt“ steht unten; dazu „Rezept
  wählen …“. Schritt 2 „Was brauchst du wirklich?“ ist der Vorratscheck: ausgewählt = normaler Text
  mit Haken, abgewählt („haben wir“) = blass und durchgestrichen.
- **Direkt in den Vorratscheck:** „Auf die Liste“ auf einer Rezeptseite überspringt Schritt 1 und
  öffnet den Vorratscheck für dieses Rezept (REQ-010). Diese Spec ist Eigentümerin dieses Ablaufs;
  Spec 0008 setzt den Knopf in die neu gestaltete Rezeptseite, Spec 0009 nutzt denselben Einstieg
  für Sammlungen.
- **Herkunft** eines Beitrags aus einem Rezept: der Rezepttitel, bei einem Eintrag aus dem Kalender
  mit dem Wochentag in Klammern („Mango-Curry (Sa)“); was direkt von der Rezeptseite oder über
  „Rezept wählen …“ kommt, steht ohne Tag („Mango-Curry“). Beiträge von Hand heißen „von Hand“.
- **Was Spec 0009 (Sammlungen) ergänzt:** In Schritt 1 steht eine eingeplante Sammlung als ein
  Eintrag „■ Grillabend (2 Rezepte)“ mit derselben Vorauswahl (Spec 0009, AC-027); eine Sammlung,
  die nichts auf die Liste bringen kann, erscheint nicht (Spec 0009, REQ-008, gleiche Regel wie
  AC-061); „Auf die Liste“ auf der Seite einer Sammlung öffnet direkt den Vorratscheck (Spec 0009,
  AC-025); die Herkunft lautet „Grillabend“ bzw. „Grillabend · Kartoffelsalat“. Diese Spec baut
  den Vorratscheck so, dass er mit beliebigen Rezepten samt Portionen und Variante gestartet werden
  kann; Sammlungen selbst prüft erst Spec 0009.
- **F1** („Ich kann keine Einträge hinzufügen“): Entweder war die Eingabezeile nicht zu finden, oder
  das Speichern ging mit dem echten Backend schief. REQ-005 prüft beides: Sichtbarkeit und ein Test
  gegen die lokale Supabase. Läuft der Test sofort grün, fragt die Umsetzung bei Enrico nach, was er
  gesehen hat.
- **Kritischer Pfad:** Migration bestehender Daten, Löschen (Liste leeren, Entfernen, erledigte
  Posten weiterer Listen), Sync (neue Speicher-Version) und Laden-Warteschlange (Haken auf
  zusammengeführten Posten). `plan.md` braucht deshalb ein Bedrohungsmodell, Negativtests (fremder
  Haushalt, abgemeldet, ungültige Eingabe, Fehlerfall) und einen `/security-check`.

**Bausteine aus Spec 0005:** Abhaken (Einkaufen), „Suchen oder anlegen“ („Was fehlt?“ und Bereich am
Posten), Fenstergrößen („Wo kaufst du ein?“ und „Liste leeren“ klein, „Posten bearbeiten“ mittel,
„Auf die Einkaufsliste“ groß), Vollbild, klebende Kopfzeile und Gruppenüberschriften.

**Was sich an älteren Specs ändert**

| Bisher                                                                                | Neu                                                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Spec 0001, AC-030: auf der Liste abhaken, unter „Erledigt“ wieder öffnen              | AC-008, AC-010: kein Abhaken auf „Liste“; unter „Erledigt“ wieder öffnen bleibt |
| Spec 0001, AC-031: Tage der Woche wählen, Vorratscheck                                | AC-049 bis AC-057: Einträge aus beliebigen Wochen, neue Darstellung             |
| Spec 0001, AC-032: Markt wählen, dann Einkaufsmodus starten                           | AC-040 bis AC-043: Markt wird in „Einkaufen“ gewählt                            |
| Spec 0003, AC-010: neuer Haushalt mit „eine Standardliste“                            | AC-006: genau eine Einkaufsliste                                                |
| Spec 0001, AC-014, AC-023, AC-028, AC-029; Spec 0003, AC-014, AC-028: „Standardliste“ | gelten weiter, mit „Einkaufsliste“ statt „Standardliste“                        |

Vision („Es kann mehrere Einkaufslisten geben“), Feature-Konzept F1 und F5 und Glossar
(Einkaufsliste, Standardliste) tragen dazu einen Hinweis „geändert durch UI-Konzept v2 / Spec 0006“.

## Anforderungen und Akzeptanzkriterien

Heute ist in den Beispielen **Freitag, 20. November 2026** (KW 47: 16.–22. November). Handybreite
heißt 390 × 844 px. Daten wie im Beispielhaushalt „Enrico & Nadja“, ergänzt um das, was im
jeweiligen Kriterium steht. Der Tab „Plan“ heißt ab Spec 0010 „Kalender“ (beide Specs in Welle 2);
die Kriterien gelten unter beiden Namen, und „Auf die Einkaufsliste“ im Plan ist dort der Knopf ⊔
(Spec 0010, AC-002).

### REQ-001 — Genau eine Einkaufsliste je Haushalt (D25)

> Jeder Haushalt hat genau eine Einkaufsliste; weitere Listen werden in sie zusammengeführt und
> verschwinden.

**Offline:** Die Zusammenführung läuft auf dem Server. Ein Gerät ohne Netz zeigt bis zum nächsten
Abgleich den alten Stand; was in seiner Laden-Warteschlange wartet, landet danach auf der einen
Liste oder wird ohne Fehler verworfen (AC-004).

**AC-001 — Zusammenführen**

```gherkin
Angenommen  „Enrico & Nadja“ hat die Standardliste mit „Milch“ (offen, von Hand 1×) und „Duschgel“
            (offen, von Hand 1×) und die Liste „Drogerie“ mit „Duschgel“ (offen, von Hand 1×, Zusatz
            „sensitiv“), „Zahnpasta“ (offen) und „Wattepads“ (abgehakt)
Wenn        die Migration auf dem Server läuft
Dann        hat der Haushalt genau eine Liste
Und         darauf stehen offen „Milch“, „Zahnpasta“ und „Duschgel (sensitiv)“ als eine Zeile mit 2×
Und         „Duschgel“ besteht aus beiden Beiträgen, jeder einzeln gespeichert
Und         „Wattepads“ und die Liste „Drogerie“ gibt es nicht mehr
```

**AC-002 — Kennungen bleiben**

```gherkin
Angenommen  derselbe Ausgangszustand
Wenn        die Migration gelaufen ist
Dann        hat „Zahnpasta“ dieselbe Kennung wie vorher in „Drogerie“
Und         „Duschgel“ hat die Kennung des Postens aus der Standardliste
```

**AC-003 — Randfall: nur eine Liste, zweiter Lauf, fremder Haushalt**

```gherkin
Angenommen  „WG Köln“ hat nur eine Liste mit drei offenen Posten
Wenn        die Migration läuft und danach ein zweites Mal
Dann        sind Liste und Posten von „WG Köln“ unverändert
Und         kein Posten von „Enrico & Nadja“ ist in „WG Köln“ gelandet oder umgekehrt
```

**AC-004 — Laden-Warteschlange über die Migration hinweg**

```gherkin
Angenommen  Nadja hat vor der Migration ohne Netz in „Drogerie“ „Duschgel“ abgehakt, den Haken bei
            „Wattepads“ zurückgenommen und „Rasierer“ hinzugefügt; alles wartet in ihrer
            Laden-Warteschlange
Wenn        die Migration läuft und Nadjas Gerät danach wieder Netz hat
Dann        ist „Duschgel“ auf der einen Liste abgehakt, für alle
Und         „Rasierer“ steht offen auf der einen Liste
Und         das Zurücknehmen bei „Wattepads“ wird verworfen, ohne dass Nadja eine Fehlermeldung
            sieht
```

**AC-005 — Keine zweite Liste**

```gherkin
Angenommen  Enrico ist Mitglied von „Enrico & Nadja“
Wenn        er über die Supabase-API eine zweite Liste für diesen Haushalt anlegen will
Dann        lehnt die Datenbank das ab
Und         eine ältere App-Version, die das versucht, zeigt „Hat nicht geklappt – bitte noch einmal
            versuchen“
```

**AC-006 — Neuer Haushalt** (ersetzt Spec 0003, AC-010, im Punkt „eine Standardliste“)

```gherkin
Angenommen  Enrico ist angemeldet
Wenn        er den Haushalt „Ferienhaus“ anlegt
Dann        hat „Ferienhaus“ genau eine Einkaufsliste
Und         die App nennt sie „Einkaufsliste“; es gibt keinen Pfeil zum Wechseln, kein „Neue Liste“
            und nirgends das Wort „Standardliste“
```

**AC-007 — Markt an der Liste zählt nicht mehr**

```gherkin
Angenommen  vor der Migration hatte „Drogerie“ den Markt „dm“ und die Standardliste keinen Markt;
            auf Enricos Gerät wurde noch nie ein Markt gewählt; der Standardmarkt ist „Rewe
            Südstadt“
Wenn        Enrico nach der Migration „Einkaufen“ startet
Dann        ist „Rewe Südstadt“ gewählt
```

### REQ-002 — „Liste“ zeigt und ordnet, ohne Abhaken (D24)

> Die Seite „Liste“ zeigt die offenen Posten nach Bereichen mit Menge und Zusatz, ohne Haken;
> Erledigtes steht eingeklappt darunter, Abhaken anderer erscheint live.

**Offline:** offline lesend.

**AC-008 — Aufbau**

```gherkin
Angenommen  offen stehen „Zwiebeln“ (2× aus „Lasagne (Fr)“), „Möhren“ (500 g aus „Kürbissuppe (Sa)“)
            und „Milch“ (2×, Zusatz „laktosefrei“); drei Posten sind erledigt
Wenn        ich „Liste“ öffne
Dann        heißt die Seite „Einkaufsliste“ und darunter steht „3 offen · für Lasagne, Kürbissuppe“
Und         die Posten stehen in Gruppen nach Bereich, in der Reihenfolge der Bereiche ohne Markt
Und         „Milch (laktosefrei)“ hat rechts „− 2× +“ und „Möhren“ hat rechts „500 g ›“
Und         keine Zeile hat ein Feld zum Abhaken
Und         oben stehen „Einkaufen“ und „+ Aus Kalender …“, unten steht eingeklappt „Erledigt (3)“
```

**AC-009 — Kein Markt auf „Liste“**

```gherkin
Angenommen  „Liste“ ist offen
Dann        gibt es dort keine Marktwahl
Und         die Gruppen ändern ihre Reihenfolge nicht, wenn auf diesem Gerät beim Einkaufen ein
            anderer Markt gewählt wurde
```

**AC-010 — Erledigt wieder öffnen** (ersetzt Spec 0001, AC-030)

```gherkin
Angenommen  „Brot“ steht unter „Erledigt (3)“
Wenn        ich „Erledigt (3)“ aufklappe und bei „Brot“ den Haken herausnehme
Dann        steht „Brot“ sofort wieder offen in seinem Bereich und „Erledigt (2)“ bleibt aufgeklappt
```

**AC-011 — Abhaken erscheint live** (Offene Frage 1)

```gherkin
Angenommen  Enrico hat „Liste“ offen, Nadja ist mit Netz in „Einkaufen“, offen sind 3 Posten
Wenn        Nadja „Milch“ abhakt
Dann        steht „Milch“ bei Enrico ohne Neuladen unter „Erledigt“
Und         oben steht „Nadja kauft gerade ein · 1 von 3“
```

**AC-012 — Randfall: Hinweis verschwindet**

```gherkin
Angenommen  oben steht „Nadja kauft gerade ein · 1 von 3“
Wenn        Nadja 15 Minuten lang nichts mehr abhakt oder „Fertig“ wählt
Dann        verschwindet der Hinweis
```

**AC-013 — Randfall: leere Liste**

```gherkin
Angenommen  auf der Liste steht nichts, auch nichts Erledigtes
Wenn        ich „Liste“ öffne
Dann        sehe ich „Die Liste ist leer“ mit „+ Aus Kalender …“ und darunter die Eingabezeile „Was
            fehlt?“
Und         „Einkaufen“ und im Menü ⋯ „Liste leeren …“ sind ausgegraut
```

### REQ-003 — Menge mit + und −

> Bei Anzahlen erhöht + den eigenen Anteil („von Hand“), − verringert zuerst den eigenen Anteil,
> dann die Anzahl aus dem Kalender; steht der Posten auf 1×, entfernt − ihn.

**Offline:** nur online, weil Ändern einer Menge keine Laden-Aktion ist. Offline sind + und −
ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“.

**AC-014 — Plus**

```gherkin
Angenommen  „Zwiebeln“ steht mit 1× aus „Lasagne (Fr)“
Wenn        ich + wähle
Dann        steht „Zwiebeln“ mit 2× da, auch bei Nadja
Und         die Herkunft lautet „Lasagne (Fr): 1× · von Hand: 1×“
```

**AC-015 — Minus bis zum Entfernen**

```gherkin
Angenommen  „Zwiebeln“ mit der Herkunft „Lasagne (Fr): 1× · von Hand: 1×“
Wenn        ich − wähle
Dann        steht „Zwiebeln“ mit 1× da und die Herkunft lautet „Lasagne (Fr): 1×“
Wenn        ich noch einmal − wähle
Dann        ist „Zwiebeln“ von der Liste verschwunden
Und         ein Hinweis bietet 5 Sekunden „Rückgängig“ an, das „Zwiebeln“ mit dieser Herkunft
            zurückholt
```

**AC-016 — Randfall: zwei Beiträge aus dem Kalender** (Offene Frage 4a)

```gherkin
Angenommen  „Eier“ mit „Kuchen (Mi): 1× · Pfannkuchen (Sa): 1×“, der Beitrag aus „Pfannkuchen“ kam
            zuletzt dazu
Wenn        ich − wähle
Dann        lautet die Herkunft „Kuchen (Mi): 1×“
```

**AC-017 — Gleichzeitig auf zwei Geräten**

```gherkin
Angenommen  „Milch“ steht mit 1×, Enrico und Nadja haben „Liste“ mit Netz offen
Wenn        beide fast gleichzeitig je einmal + wählen
Dann        steht „Milch“ danach auf beiden Geräten mit 3× da
```

**AC-018 — Mengen statt Anzahl**

```gherkin
Angenommen  „Möhren“ steht mit 500 g aus „Kürbissuppe (Sa)“
Dann        hat die Zeile kein + und −, sondern „500 g ›“
Wenn        ich die Zeile antippe
Dann        öffnet sich „Posten bearbeiten“ für „Möhren“
```

**AC-019 — Randfall: offline**

```gherkin
Angenommen  das Gerät ist offline, „Milch“ steht mit 2× auf der Liste
Wenn        ich „Liste“ öffne
Dann        sind + und − ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“
```

### REQ-004 — Posten bearbeiten und entfernen

> Antippen öffnet „Posten bearbeiten“ mit Menge, Zusatz, Bereich, Herkunft und „Entfernen“; nach
> links wischen entfernt mit „Rückgängig“.

**Offline:** Bereich zuordnen offline vollständig (Laden-Aktion, ADR-0008 Nachtrag; einen Bereich
neu anlegen nur online). Menge, Zusatz und Entfernen nur online.

**AC-020 — Fenster**

```gherkin
Angenommen  „Milch“ mit der Herkunft „Pfannkuchen (Sa): 1× · von Hand: 1×“ im Bereich „Kühlregal &
            Molkerei“
Wenn        ich „Milch“ antippe
Dann        öffnet sich das mittlere Fenster „Milch“ mit „Menge − 2× +“, dem Feld „Zusatz“,
            „Bereich: Kühlregal & Molkerei ›“, der Herkunft „Pfannkuchen (Sa): 1× · von Hand: 1×“,
            „Entfernen“ und „Fertig“
```

**AC-021 — Zusatz** (Offene Frage 2)

```gherkin
Angenommen  das Fenster „Milch“, die Milch hat keinen Zusatz
Wenn        ich als Zusatz „laktosefrei“ eingebe und „Fertig“ wähle
Dann        steht auf der Liste „Milch (laktosefrei)“, auch bei Nadja
Wenn        ich den Zusatz wieder leere und „Fertig“ wähle
Dann        steht dort „Milch“ ohne Klammern
```

**AC-022 — Randfall: Zusatz zu lang**

```gherkin
Angenommen  das Fenster „Milch“
Wenn        ich einen Zusatz mit 201 Zeichen eingebe
Dann        lässt sich „Fertig“ nicht wählen und das Feld zeigt „Höchstens 200 Zeichen“
```

**AC-023 — Bereich zuordnen**

```gherkin
Angenommen  „Geschenkpapier“ steht unter „Ohne Bereich“
Wenn        ich im Fenster „Bereich“ wähle, „Haus“ tippe und „Haushalt & Reinigung“ wähle
Dann        steht „Geschenkpapier“ unter „Haushalt & Reinigung“
Und         der Artikel „Geschenkpapier“ gehört künftig zu diesem Bereich, auch beim Einkaufen und
            beim nächsten Mal auf der Liste
```

**AC-024 — Bereich neu anlegen**

```gherkin
Angenommen  das Fenster „Geschenkpapier“, das Gerät ist online, es gibt keinen Bereich „Deko“
Wenn        ich unter „Bereich“ „Deko“ tippe und „„Deko“ neu anlegen“ wähle
Dann        gibt es im Haushalt den Bereich „Deko“ und „Geschenkpapier“ steht darunter
```

**AC-025 — Entfernen**

```gherkin
Angenommen  „Milch“ steht offen mit zwei Beiträgen auf der Liste
Wenn        ich in „Posten bearbeiten“ „Entfernen“ wähle
Dann        ist „Milch“ von der Liste verschwunden, auch bei Nadja
Und         ein Hinweis bietet 5 Sekunden „Rückgängig“ an, das „Milch“ mit beiden Beiträgen
            zurückholt
Wenn        ich stattdessen die Zeile „Milch“ nach links wische
Dann        passiert dasselbe
```

**AC-026 — Konflikt: entfernt, während jemand abhakt**

```gherkin
Angenommen  Nadja ist ohne Netz in „Einkaufen“ und hakt „Milch“ ab
Wenn        Enrico „Milch“ mit Netz entfernt und Nadjas Gerät danach wieder Netz hat
Dann        ist „Milch“ auf beiden Geräten verschwunden und Nadja sieht keine Fehlermeldung (wie
            Spec 0003, AC-025)
```

**AC-027 — Randfall: Posten verschwindet im offenen Fenster** (Offene Frage 4e)

```gherkin
Angenommen  Enrico hat „Posten bearbeiten“ für „Milch“ offen
Wenn        Nadja „Milch“ entfernt
Dann        schließt sich Enricos Fenster mit dem Hinweis „Milch steht nicht mehr auf der Liste“
```

### REQ-005 — Hinzufügen mit „Was fehlt?“ (F1)

> Die Eingabezeile „Was fehlt?“ ist auf „Liste“ immer erreichbar, findet Artikel über „Suchen oder
> anlegen“ und schreibt nachweislich in die echte Datenbank.

**Offline:** offline vollständig (Laden-Aktion „Posten hinzufügen“, ADR-0008 Nachtrag).

**AC-028 — Eingabezeile ist zu sehen**

```gherkin
Angenommen  Handybreite, auf der Liste stehen 30 offene Posten
Wenn        ich „Liste“ öffne
Dann        ist die Eingabezeile „Was fehlt?“ ohne Scrollen sichtbar, direkt über der Tab-Leiste
Wenn        ich in die Eingabezeile tippe und die Bildschirmtastatur erscheint
Dann        steht die Eingabezeile sichtbar über der Tastatur
```

**AC-029 — Gegen das echte Backend** (F1)

```gherkin
Angenommen  die lokale Supabase läuft, Enrico ist mit dem Testkonto angemeldet, „Spülmittel“ steht
            nicht auf der Liste, Nadja hat „Liste“ auf einem zweiten Gerät offen
Wenn        Enrico in „Was fehlt?“ „2 Spülmittel (Zitrone)“ eingibt und bestätigt
Dann        steht „Spülmittel (Zitrone)“ mit 2× auf seiner Liste
Und         nach dem Neuladen der Seite weiterhin
Und         bei Nadja, ohne dass sie neu lädt
```

**AC-030 — Neuer Artikel**

```gherkin
Angenommen  es gibt keinen Artikel „Drachenfrucht“
Wenn        ich „Drachenfrucht“ eingebe und bestätige
Dann        ist „Drachenfrucht“ ein neuer Artikel des Haushalts und steht unter „Ohne Bereich“
```

**AC-031 — Bremse gegen Doppelte**

```gherkin
Angenommen  es gibt den Artikel „Kokosmilch“
Wenn        ich „Kokosmilsch“ eingebe und bestätige
Dann        fragt die Zeile „Meinst du Kokosmilch?“ mit „Ja“ und „Trotzdem neu“
Wenn        ich „Ja“ wähle
Dann        steht „Kokosmilch“ auf der Liste und es ist kein neuer Artikel entstanden
```

**AC-032 — Fehlerfall: Server lehnt ab**

```gherkin
Angenommen  das Gerät ist online und der Server lehnt das Hinzufügen dauerhaft ab
Wenn        ich „Brot“ hinzufüge
Dann        verschwindet „Brot“ wieder von der Liste
Und         ein Hinweis sagt „Hat nicht geklappt – bitte noch einmal versuchen“
```

**AC-033 — Offline**

```gherkin
Angenommen  das Gerät ist offline
Wenn        ich „Brot“ hinzufüge
Dann        steht „Brot“ sofort auf der Liste
Und         sobald das Gerät wieder Netz hat, auch bei Nadja (wie Spec 0003, AC-023)
```

### REQ-006 — Liste leeren und Erledigt leeren

> Das Menü ⋯ der Liste bietet „Erledigt leeren“, „Liste leeren …“ mit Bestätigung und
> anschließendem „Rückgängig“ sowie die Wege zu „Märkte & Bereiche“ und „Artikel“.

**Offline:** nur online; offline sind „Erledigt leeren“ und „Liste leeren …“ ausgegraut mit
„Offline – zum Bearbeiten brauchst du Netz“. Die Wege zu den anderen Seiten gehen offline.

**AC-034 — Menü**

```gherkin
Angenommen  „Liste“ ist offen
Wenn        ich ⋯ im Kopf wähle
Dann        bietet das Menü „Erledigt leeren“, „Liste leeren …“, „Märkte & Bereiche“ und, sobald
            Spec 0007 die Seite gebaut hat, „Artikel“
Wenn        ich „Märkte & Bereiche“ wähle
Dann        öffnet sich die Seite „Märkte & Bereiche“ und „Zurück“ führt wieder zur Liste
```

**AC-035 — Liste leeren** (Offene Frage 3)

```gherkin
Angenommen  auf der Liste stehen 14 offene und 3 erledigte Posten, darunter Posten aus „Lasagne“
Wenn        ich ⋯ → „Liste leeren …“ wähle
Dann        fragt ein kleines Fenster „Einkaufsliste leeren?“ mit dem Text „Alle 17 Posten werden
            entfernt, auch die aus dem Kalender.“ und den Knöpfen „Abbrechen“ und „Liste leeren“
Wenn        ich „Liste leeren“ wähle
Dann        ist die Liste leer, auch bei Nadja
Und         ein Hinweis bietet 5 Sekunden „Rückgängig“ an, das alle 17 Posten mit ihren Beiträgen
            zurückholt
```

**AC-036 — Abbrechen**

```gherkin
Angenommen  das Fenster „Einkaufsliste leeren?“ ist offen
Wenn        ich „Abbrechen“ wähle
Dann        schließt sich das Fenster und die Liste ist unverändert
```

**AC-037 — Konflikt: Rückgängig, nachdem jemand etwas hinzugefügt hat**

```gherkin
Angenommen  ich habe die Liste mit „Milch (von Hand 1×)“ geleert
Wenn        Nadja innerhalb der 5 Sekunden „Milch“ neu hinzufügt und ich danach „Rückgängig“ wähle
Dann        stehen alle geleerten Posten wieder da
Und         „Milch“ steht als eine Zeile mit 2×, aus meinem früheren und Nadjas neuem Beitrag
```

**AC-038 — Negativ: fremder Haushalt und abgemeldet**

```gherkin
Angenommen  Nadja ist nicht Mitglied von „WG Köln“
Wenn        sie über die Supabase-API die Liste von „WG Köln“ leeren will
Dann        wird der Aufruf abgelehnt und kein Posten von „WG Köln“ entfernt
Und         ohne Anmeldung wird derselbe Aufruf ebenso abgelehnt
```

**AC-039 — Danach ist der Kalender wieder auswählbar**

```gherkin
Angenommen  „Lasagne“ steht am Freitag im Plan, ihre Zutaten standen auf der Liste, und die Liste
            wurde geleert
Wenn        ich „+ Aus Kalender …“ wähle
Dann        ist „Lasagne“ wieder vorausgewählt, weil nichts mehr von ihr auf der Liste steht
```

### REQ-007 — Einkaufen mit Marktwahl (D26)

> „Einkaufen“ zeigt oben den gewählten Markt und sortiert nach dessen Laufreihenfolge;
> vorausgewählt ist der zuletzt auf diesem Gerät gewählte Markt, sonst der Standardmarkt des
> Haushalts.

**Offline:** offline vollständig: Abhaken, „nicht da“, Posten hinzufügen und Bereich zuordnen über
die Laden-Warteschlange; die Marktwahl liegt auf dem Gerät.

**AC-040 — Vorauswahl**

```gherkin
Angenommen  auf Enricos Gerät wurde noch nie ein Markt gewählt, der Standardmarkt ist „Rewe
            Südstadt“
Wenn        Enrico „Einkaufen“ startet
Dann        steht oben der Chip „Rewe Südstadt ▾“ und die Posten sind in der Laufreihenfolge von
            „Rewe Südstadt“ gruppiert
Und         es gibt keine Wahl einer Liste
```

**AC-041 — Markt wechseln** (ersetzt Spec 0001, AC-032, in der Marktwahl)

```gherkin
Angenommen  Enrico ist in „Einkaufen“ bei „Rewe Südstadt“
Wenn        er den Chip wählt
Dann        öffnet sich das kleine Fenster „Wo kaufst du ein?“ mit allen Märkten, „Standard“ bei
            „Rewe Südstadt“, „Ohne Markt – nach Bereichen“ und „Märkte verwalten ›“
Wenn        er „Aldi Nord“ wählt
Dann        schließt sich das Fenster und die Posten stehen sofort in der Laufreihenfolge von
            „Aldi Nord“
```

**AC-042 — Das Gerät merkt sich den Markt**

```gherkin
Angenommen  Enrico hat in „Einkaufen“ „Aldi Nord“ gewählt
Wenn        er „Einkaufen“ später wieder startet, auch nach dem Neuladen der Seite
Dann        ist „Aldi Nord“ gewählt
Und         auf Nadjas Gerät, das noch nie einen Markt gewählt hat, ist „Rewe Südstadt“ gewählt
```

**AC-043 — Randfall: gewählter Markt gelöscht, kein Standardmarkt**

```gherkin
Angenommen  Enricos Gerät hat zuletzt „Aldi Nord“ gewählt, „Aldi Nord“ wurde gelöscht und der
            Haushalt hat keinen Standardmarkt
Wenn        Enrico „Einkaufen“ startet
Dann        steht oben „Ohne Markt – nach Bereichen“ und die Posten stehen in der Reihenfolge der
            Bereiche ohne Markt
```

**AC-044 — Abhaken mit Sammel-Fenster**

```gherkin
Angenommen  in „Einkaufen“ stehen „Mango“ und „Limetten“ offen, Nadja hat „Liste“ mit Netz offen
Wenn        Enrico „Limetten“ abhakt
Dann        ist „Limetten“ durchgestrichen und bleibt an seiner Stelle, ohne „Rückgängig“-Hinweis
Und         der Haken geht sofort an den Server, nicht erst nach dem Sammel-Fenster
Und         2 Sekunden nach Enricos letztem Tipp gleitet „Limetten“ nach „Im Wagen (1)“
```

**AC-045 — Aus „Im Wagen“ zurück und offline**

```gherkin
Angenommen  Enricos Gerät ist ohne Netz, „Limetten“ steht unter „Im Wagen (1)“
Wenn        er dort den Haken herausnimmt und „Milch“ abhakt
Dann        steht „Limetten“ wieder offen in ihrer Gruppe und „Milch“ gleitet nach „Im Wagen (1)“
Und         beides bleibt nach dem Neuladen der Seite so und wird nachgereicht, sobald Netz da ist
            (wie Spec 0003, AC-024)
```

**AC-046 — Posten hinzufügen im Laden**

```gherkin
Angenommen  Enrico ist ohne Netz in „Einkaufen“ bei „Rewe Südstadt“
Wenn        er unten „Posten hinzufügen“ wählt und „Brot“ eingibt
Dann        steht „Brot“ sofort in seinem Bereich bzw. unter „Ohne Bereich“
Und         sobald das Gerät wieder Netz hat, auf der Liste aller Geräte
```

**AC-047 — Fertig**

```gherkin
Angenommen  Enrico ist mit Netz in „Einkaufen“, 8 von 10 Posten sind abgehakt
Wenn        er oben „Fertig“ wählt
Dann        verlässt er „Einkaufen“ und die 8 abgehakten Posten sind von der Liste entfernt
Und         ein Hinweis sagt „8 gekauft · 2 bleiben“ und bietet 5 Sekunden „Rückgängig“ an
Wenn        er dasselbe ohne Netz tut
Dann        verlässt „Fertig“ nur „Einkaufen“ mit dem Hinweis „Abgehakte räumen wir auf, sobald du
            Netz hast“ (Spec 0003, Entscheidung 6)
```

**AC-048 — Märkte verwalten**

```gherkin
Angenommen  das Fenster „Wo kaufst du ein?“ ist offen
Wenn        ich „Märkte verwalten ›“ wähle
Dann        öffnet sich „Märkte & Bereiche“
Wenn        ich dort „Zurück“ wähle
Dann        bin ich wieder in „Einkaufen“ mit demselben Markt
```

### REQ-008 — „Auf die Einkaufsliste“, Schritt 1: Einträge wählen (D21)

> Im ersten Schritt blättert man durch Wochen und wählt Rezept-Einträge; vorausgewählt ist, was ab
> heute bis Ende der Ausgangswoche geplant ist und noch nicht auf der Liste steht.

**Offline:** offline lesend. Übernehmen braucht Netz, deshalb sind „+ Aus Kalender …“ und „Auf die
Einkaufsliste“ offline ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“.

**Ausgangsplan** für dieses REQ: Do 19. „Shakshuka“; Fr 20. „Lasagne“ und „Mango-Curry“ (die
Zutaten von „Mango-Curry“ stehen schon auf der Liste); Sa 21. „Kürbissuppe“ und das Restaurant „Da
Enzo“; So 22. „Linsen-Dal“ und die Aktivität „Bouldern“; vorgemerkt „Halloumi-Pfanne“; Mo 23.
(KW 48) „Paella“. Ein Eintrag **steht schon auf der Liste**, wenn ein Posten der Liste, offen oder
erledigt, einen Beitrag aus diesem Eintrag hat. Ein Eintrag, der nichts auf die Liste bringen kann
(Rezept ohne Zutaten), erscheint in Schritt 1 nicht, wie Restaurants und Aktivitäten (AC-061;
Annahme, Offene Frage 5; dieselbe Regel gilt für Sammlungen, Spec 0009, REQ-008).

**AC-049 — Vorauswahl von der Liste aus**

```gherkin
Angenommen  der Ausgangsplan, ich bin auf „Liste“
Wenn        ich „+ Aus Kalender …“ wähle
Dann        öffnet sich das große Fenster „Was soll auf die Liste?“ mit „KW 47 · 16.–22. Nov“
Und         ausgewählt sind „Lasagne“, „Kürbissuppe“ und „Linsen-Dal“
Und         nicht ausgewählt sind „Shakshuka“ mit „vorbei“, „Mango-Curry“ mit „steht schon auf der
            Liste“ und ganz unten unter „Vorgemerkt“ „Halloumi-Pfanne“
Und         „Da Enzo“ und „Bouldern“ stehen nicht im Fenster
Und         der Knopf heißt „Weiter: 3 Gerichte“
```

**AC-050 — Andere Woche**

```gherkin
Angenommen  dasselbe Fenster mit der Auswahl aus AC-049
Wenn        ich › wähle
Dann        steht dort „KW 48 · 23.–29. Nov“ mit „Paella“, nicht ausgewählt
Wenn        ich „Paella“ wähle
Dann        heißt der Knopf „Weiter: 4 Gerichte“ und die Auswahl aus KW 47 bleibt erhalten
```

**AC-051 — Vorauswahl vom Plan aus**

```gherkin
Angenommen  der Ausgangsplan, im Plan ist KW 48 angezeigt
Wenn        ich dort „Auf die Einkaufsliste“ wähle
Dann        zeigt das Fenster KW 48 und „Paella“ ist ausgewählt
Wenn        ich ‹ wähle
Dann        ist in KW 47 nichts ausgewählt
```

**AC-052 — Tag antippen** (Offene Frage 4c)

```gherkin
Angenommen  im Fenster aus AC-049 ist am Fr 20. „Lasagne“ ausgewählt und „Mango-Curry“ nicht
Wenn        ich auf „Fr 20“ tippe
Dann        sind „Lasagne“ und „Mango-Curry“ ausgewählt
Wenn        ich noch einmal auf „Fr 20“ tippe
Dann        ist keiner der beiden ausgewählt
```

**AC-053 — Rezept wählen, das nicht im Plan steht**

```gherkin
Angenommen  das Fenster „Was soll auf die Liste?“
Wenn        ich „Rezept wählen …“ wähle, „Shaksh“ tippe und „Shakshuka“ wähle
Dann        steht „Shakshuka“ ausgewählt unter „Ohne Tag“ mit den Portionen des Rezepts
Und         ihre Posten bekommen später die Herkunft „Shakshuka“ ohne Tag
```

**AC-054 — Randfall: vergangene Woche, nichts gewählt**

```gherkin
Angenommen  im Plan ist KW 46 angezeigt
Wenn        ich dort „Auf die Einkaufsliste“ wähle
Dann        ist nichts ausgewählt
Und         „Weiter“ ist ausgegraut mit dem Hinweis „Wähle mindestens ein Gericht“
```

**AC-061 — Randfall: Rezept ohne Zutaten** (Annahme, Offene Frage 5)

```gherkin
Angenommen  der Ausgangsplan, „Kürbissuppe“ (Sa 21.) hat aber keine Zutaten
Wenn        ich auf „Liste“ „+ Aus Kalender …“ wähle
Dann        steht „Kürbissuppe“ nicht im Fenster
Und         ausgewählt sind „Lasagne“ und „Linsen-Dal“, der Knopf heißt „Weiter: 2 Gerichte“
```

### REQ-009 — Schritt 2: Vorratscheck, Ausgewähltes sieht normal aus

> Im Vorratscheck ist Ausgewähltes normaler Text mit Haken und Abgewähltes blass und
> durchgestrichen; „Vorrat & Gewürze“ ist eingeklappt und abgewählt; beide Schritte teilen ein
> Fenster gleicher Größe.

**Offline:** nur online (Übernehmen schreibt auf die Liste, Spec 0003, AC-020: alles oder nichts).

**AC-055 — Darstellung** (ersetzt Spec 0001, AC-031)

```gherkin
Angenommen  „Mango-Curry“ steht am Samstag im Plan und auf keiner Liste; es hat „Mango“ und
            „Kokosmilch“ sowie „Reis“ und „Kreuzkümmel“, beide als Vorrat markiert
Wenn        ich in Schritt 1 nur „Mango-Curry“ wähle und „Weiter“ wähle
Dann        zeigt dasselbe Fenster in derselben Größe „Was brauchst du wirklich?“
Und         unter „Kommt auf die Liste“ stehen „Mango“ und „Kokosmilch“ als normaler Text mit Haken,
            je mit Menge und der Herkunft „Mango-Curry (Sa)“
Und         „Vorrat & Gewürze (2)“ ist eingeklappt und abgewählt
```

**AC-056 — Abwählen und übernehmen**

```gherkin
Angenommen  der Vorratscheck aus AC-055
Wenn        ich „Mango“ abwähle
Dann        steht „Mango“ blass und durchgestrichen da und der Knopf heißt „1 übernehmen“
Wenn        ich „Vorrat & Gewürze (2)“ aufklappe
Dann        stehen „Reis“ und „Kreuzkümmel“ blass und durchgestrichen da
Wenn        ich „1 übernehmen“ wähle
Dann        steht „Kokosmilch“ auf der Liste und „Mango“, „Reis“ und „Kreuzkümmel“ stehen nicht dort
```

**AC-057 — Zurück und Randfall: nichts ausgewählt**

```gherkin
Angenommen  der Vorratscheck aus AC-055
Wenn        ich „‹ Zurück“ wähle
Dann        bin ich in Schritt 1 und „Mango-Curry“ ist weiter ausgewählt
Wenn        ich wieder „Weiter“ wähle und alles abwähle
Dann        heißt der Knopf „0 übernehmen“ und ist ausgegraut
```

### REQ-010 — Vom Rezept auf die Liste

> Auf der Rezeptseite öffnet „Auf die Liste“ direkt den Vorratscheck für dieses Rezept mit den
> angezeigten Portionen und der gewählten Variante.

Diese Spec ist Eigentümerin des Verhaltens und setzt den Knopf in die heutige Rezeptseite. Spec
0008, REQ-010 setzt ihn in die neu gestaltete Rezeptseite und verweist hierher; Spec 0009, AC-025
nutzt denselben direkten Einstieg für Sammlungen. Die Herkunft ist der Rezepttitel ohne Tag
(„Konzept in Kürze“, Herkunft).

**Offline:** nur online; offline ist „Auf die Liste“ ausgegraut mit „Offline – zum Bearbeiten
brauchst du Netz“.

**AC-058 — Vorratscheck aus dem Rezept**

```gherkin
Angenommen  „Mango-Curry“ für 4 Portionen mit „Kokosmilch 400 ml“ (Rezeptmenge), „Mango“ (Anzahl),
            „Tofu“ (Anzahl, Variante „mit Tofu“), „Reis“ und „Kreuzkümmel“ (beide Vorrat)
Und         auf der Rezeptseite sind 6 Portionen und die Variante „mit Tofu“ eingestellt
Wenn        ich „Auf die Liste“ wähle
Dann        öffnet sich „Was brauchst du wirklich?“ ohne den Schritt „Was soll auf die Liste?“
Und         ausgewählt stehen „Kokosmilch 600 ml“, „Mango 1×“ und „Tofu 1×“ mit der Herkunft
            „Mango-Curry“
Wenn        ich übernehme
Dann        stehen „Kokosmilch“, „Mango“ und „Tofu“ mit der Herkunft „Mango-Curry“ ohne Tag auf der
            Liste und ich bin weiter auf der Rezeptseite
```

**AC-059 — Steht schon auf der Liste**

```gherkin
Angenommen  „Mango“ steht offen mit „von Hand: 1×“ auf der Liste
Wenn        ich „Mango-Curry“ wie in AC-058 übernehme
Dann        steht „Mango“ als eine Zeile mit 2× und der Herkunft „von Hand: 1× · Mango-Curry: 1×“
```

**AC-060 — Randfall: Rezept ohne Zutaten**

```gherkin
Angenommen  „Kürbissuppe“ hat noch keine Zutaten
Wenn        ich „Kürbissuppe“ öffne
Dann        ist „Auf die Liste“ ausgegraut mit dem Hinweis „Noch keine Zutaten“
```

## Offline und Konflikte

| Aktion                                           | Offline                                   | Konfliktregel (`docs/architecture/sync.md`)                                                            |
| ------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Liste lesen, „Erledigt“ aufklappen               | offline vollständig                       | —                                                                                                      |
| Abhaken, „nicht da“, hinzufügen, Bereich         | offline vollständig (Laden-Warteschlange) | „Abhaken gewinnt“; hinzufügen hängt an den offenen Posten desselben Artikels; Bereich: letzte Änderung |
| + und −                                          | nur online                                | jeder Tipp zählt (AC-017), keine verlorene Änderung                                                    |
| Zusatz, Entfernen, Liste leeren, Erledigt leeren | nur online                                | Zusatz: letzte Änderung gewinnt; Entfernen gewinnt gegen einen späteren Haken (AC-026)                 |
| „Auf die Einkaufsliste“, „Auf die Liste“         | nur online                                | eine Transaktion; zusammengeführt mit offenen Posten desselben Artikels                                |
| Marktwahl in „Einkaufen“                         | offline vollständig (nur auf dem Gerät)   | kein Konflikt: jedes Gerät hat seine eigene Wahl                                                       |

- **Migration und Warteschlange:** Ein Haken, ein Zurücknehmen oder ein hinzugefügter Posten, der
  vor der Migration offline entstand, zeigt danach auf den Posten der einen Liste. Gehört er zu
  einem gelöschten Posten, wird er ohne Fehlermeldung verworfen (AC-004).
- **Rückgängig nach Liste leeren**, während jemand etwas hinzugefügt hat: Die Posten kommen zurück
  und vereinen sich mit offenen Posten desselben Artikels (AC-037).
- **Fehler beim Schreiben** zeigt die App ehrlich an („Hat nicht geklappt – bitte noch einmal
  versuchen“), auch beim Hinzufügen über die Laden-Warteschlange (AC-032).

## Plattformen

- **Handy:** „Einkaufen“ ist Vollbild mit „Fertig“ oben (Spec 0005). Wischen nach links hat die
  Alternative „Posten bearbeiten“ → „Entfernen“. + und − haben Tippflächen von mindestens 44 × 44 pt.
  Die Eingabezeile bleibt über der Bildschirmtastatur (auch in Safari auf dem iPhone).
- **Tablet und Desktop:** „Posten bearbeiten“ als Dialog in der Mitte, „Einkaufen“ mit sichtbarer
  Seitenleiste. Wischen gibt es dort nicht; Entfernen geht über „Posten bearbeiten“. Enter in „Was
  fehlt?“ fügt hinzu.
- **Android und Browser:** Die Zurück-Taste verlässt „Einkaufen“, ohne Abgehaktes aufzuräumen; das
  bleibt unter „Erledigt“ (Offene Frage 4d).
- **PWA:** Die Marktwahl liegt im Speicher des Browsers. Ist er leer (z. B. privates Fenster), gilt
  der Standardmarkt.

## Daten

- **Gelesen:** Liste, Posten und Beiträge, Planeinträge, Rezepte, Artikel, Bereiche, Märkte,
  Mitglieder (Name in „Nadja kauft gerade ein“).
- **Geschrieben:** Beiträge (Anzahl, Zusatz), Posten, der Bereich eines Artikels, neue Artikel und
  Bereiche.
- **Gelöscht:** Posten mit ihren Beiträgen (Entfernen, Liste leeren, Erledigt leeren, „Fertig“); bei
  der Migration die weiteren Listen und deren erledigte Posten. Jede Löschung erreicht die anderen
  Geräte über das Löschprotokoll.
- **Migration in einfachen Worten:** siehe „Konzept in Kürze“. Danach gibt es je Haushalt höchstens
  eine Liste; der Markt an der Liste wird nicht mehr gelesen und später entfernt; die App lädt mit
  einer neuen Speicher-Version einmal alles neu (Spec 0003, AC-018).
- **Nur auf dem Gerät:** der zuletzt in „Einkaufen“ gewählte Markt, je Haushalt; er wird beim
  Abmelden mit gelöscht. Der Standardmarkt bleibt in der Datenbank.
- **Personenbezogen:** Wer wann abgehakt hat, wird schon gespeichert. Neu ist nur, dass die App
  daraus „Nadja kauft gerade ein“ zeigt. Neue personenbezogene Felder gibt es nicht.

## Offene Fragen

| #   | Frage                                                                                                                                                                                                                                 | Optionen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Empfehlung                                                              | Status                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------- |
| 1   | Woher weiß Enricos Gerät, dass Nadja gerade einkauft (Konzept: „Nadja ist bei Rewe · 7 von 14“)? Die Marktwahl liegt nach D26 nur auf ihrem Gerät.                                                                                    | A: aus vorhandenen Daten ableiten — hat Nadja in den letzten 15 Minuten einen Posten abgehakt, steht „Nadja kauft gerade ein · 7 von 14“, ohne Markt — Pro: keine neue Technik, keine neuen personenbezogenen Daten; Contra: kein Marktname, erscheint erst nach dem ersten Haken, 15 Minuten sind geschätzt · B: Realtime-Presence mit Markt — Pro: sofort und mit Markt; Contra: zweiter Realtime-Weg neben „nur Signal“ (Nachtrag zu ADR-0008), die Marktwahl verlässt das Gerät · C: Hinweis weglassen — Pro: nichts zu bauen; Contra: Konzept 3.7 nicht erfüllt                                                                                                                                                                                                                | A, weil es mit dem bestehenden Sync auskommt                            | OFFEN, Annahme A mit 15 Minuten |
| 2   | Was bearbeitet das Feld „Zusatz“, wenn mehrere Beiträge verschiedene Zusätze haben?                                                                                                                                                   | A: einen Zusatz für den ganzen Posten — was ich speichere, steht danach an allen Beiträgen — Pro: man bearbeitet, was man sieht; Contra: ein Zusatz aus einem Rezept wird überschrieben · B: nur den Zusatz des Beitrags „von Hand“ — Pro: Rezept-Zusätze bleiben; Contra: in Klammern steht weiter, was man nicht ändern kann                                                                                                                                                                                                                                                                                                                                                                                                                                                      | A, weil Enrico „die Notiz in Klammern“ bearbeiten will                  | OFFEN, Annahme A                |
| 3   | Entfernt „Liste leeren“ auch das Erledigte?                                                                                                                                                                                           | A: ja, alle Posten; der Dialog nennt die Gesamtzahl — Pro: danach ist wirklich alles leer; Contra: die Zahl im Dialog ist größer als „offen“ · B: nur offene Posten — Pro: passt zur Zahl „offen“; Contra: Erledigtes bleibt stehen, es braucht zusätzlich „Erledigt leeren“                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | A, weil „leeren“ leer bedeutet                                          | OFFEN, Annahme A                |
| 4   | Kleinere Auslegungen, die das Konzept offenlässt                                                                                                                                                                                      | (a) − nimmt zuerst den Anteil „von Hand“, danach den zuletzt hinzugekommenen Beitrag aus dem Kalender · (b) + und − gibt es nur bei reinen Anzahlen; bei Mengen steht die Menge mit ›; in „Posten bearbeiten“ ändert ± nur den Anteil „von Hand“ · (c) Tipp auf einen Tag wählt alle seine Einträge, sind schon alle gewählt, wählt er alle ab · (d) Die Zurück-Taste verlässt „Einkaufen“ ohne aufzuräumen · (e) Ein offenes „Posten bearbeiten“ schließt sich mit Hinweis, wenn der Posten woanders entfernt wurde · (f) Die Marktwahl gilt je Haushalt auf dem Gerät und wird beim Abmelden gelöscht · (g) Unter „Erledigt“ wirkt „Haken raus“ sofort, ohne Sammel-Fenster · (h) Ein Rezept aus „Rezept wählen …“ steht unter „Ohne Tag“ und kommt mit den Portionen des Rezepts | wie beschrieben, weil es die kleinste Lösung ist, die zum Konzept passt | OFFEN, Annahmen (a) bis (h)     |
| 5   | Erscheint ein Rezept ohne Zutaten in Schritt 1 „Was soll auf die Liste?“? Spec 0009, REQ-008 blendet eine Sammlung ohne Zutaten dort aus; das Konzept (3.5) lässt Restaurants und Aktivitäten weg, weil es „nichts einzukaufen“ gibt. | A: nein, für Rezepte und Sammlungen gleich (AC-061) — Pro: dieselbe Begründung wie im Konzept, eine Regel für beide Arten; Contra: ein geplantes Rezept fehlt im Fenster · B: ja, für beide; der Vorratscheck bringt dafür nichts mit — Pro: alles Geplante ist sichtbar; Contra: Auswahl ohne Wirkung, Spec 0009 müsste angepasst werden                                                                                                                                                                                                                                                                                                                                                                                                                                           | A, weil es der Regel des Konzepts für Restaurants und Aktivitäten folgt | OFFEN, Annahme A                |

## Rückverfolgbarkeit

| REQ     | AC                        | Task (plan.md) | Test |
| ------- | ------------------------- | -------------- | ---- |
| REQ-001 | AC-001 bis AC-007         | —              | —    |
| REQ-002 | AC-008 bis AC-013         | —              | —    |
| REQ-003 | AC-014 bis AC-019         | —              | —    |
| REQ-004 | AC-020 bis AC-027         | —              | —    |
| REQ-005 | AC-028 bis AC-033         | —              | —    |
| REQ-006 | AC-034 bis AC-039         | —              | —    |
| REQ-007 | AC-040 bis AC-048         | —              | —    |
| REQ-008 | AC-049 bis AC-054, AC-061 | —              | —    |
| REQ-009 | AC-055 bis AC-057         | —              | —    |
| REQ-010 | AC-058 bis AC-060         | —              | —    |
