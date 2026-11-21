---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-20
---

# 0007 — Artikel-Katalog und Stammdaten

## Problem

Zutaten im Rezept sind heute Freitext. Schreibt Enrico einmal „Kokosmilch“ und einmal
„Milchkokos“, sind das zwei verschiedene Dinge: Beide muss man einem Bereich zuordnen, auf der Liste
stehen zwei Zeilen, und der Vegan-Filter kennt den zweiten nicht. Zutaten ohne Artikel kann der
Vorratscheck gar nicht übernehmen („Nicht im Katalog – bitte von Hand eintragen“). Für die Artikel
selbst gibt es keine Seite: Man kann sie nicht umbenennen, keine Synonyme pflegen und keine
Doppelten zusammenführen. Bei Märkten fehlt das Meiste: Bereiche hinzufügen, löschen, umbenennen,
einen Markt umbenennen oder löschen, und die Seiten haben weder Tab-Leiste noch Seitenleiste.

## Ziel

- Jede Zutat zeigt auf einen Artikel. Man wählt ihn per „Suchen oder anlegen“; was fehlt, legt man
  bewusst neu an. Für Notizen fürs Kochen gibt es den _Hinweis_.
- Bestehende Freitext-Zutaten sind automatisch einem Artikel zugeordnet. Was dabei neu entstand,
  steht auf der Artikel-Seite unter „Neu aus Rezepten“ zum Prüfen.
- Auf der Seite „Artikel“ lassen sich Artikel finden, umbenennen, mit Synonymen, Bereich, Vorrat,
  Ernährungseigenschaft und Standard-Einkaufsregel versehen, zusammenführen und, wenn unbenutzt,
  löschen.
- Auf „Märkte & Bereiche“ lassen sich Märkte anlegen, umbenennen, als Standard setzen und löschen,
  ihre Laufreihenfolge ordnen und Bereiche anlegen, umbenennen, ordnen, zusammenlegen und löschen.

**Stammdaten** heißt in dieser Spec: die Artikel, Märkte und Bereiche eines Haushalts. Gemeint ist
nicht der Starter-Katalog (Glossar). Das Wort steht nur in Dokumenten; in der App liegen die Seiten
unter „Verwalten“ → „Einkaufen“.

## Nicht-Ziele

- **Kein Neubau des Rezept-Editors.** Abschnittsweises Bearbeiten, Küche und Schlagworte kommen mit
  Spec 0008. Diese Spec legt fest, wie eine Zutat ihren Artikel bekommt, und gilt im heutigen wie im
  künftigen Editor.
- **Keine eigenen Zutaten von Sammlungen** (Spec 0009).
- **Kein Bestand mit Mengen.** „Vorrat“ bleibt eine Markierung, die die App nie selbst setzt.
- **Kein neuer Inhalt im Starter-Katalog** und keine Pflege des Katalogs selbst.
- **Keine Massenbearbeitung** mehrerer Artikel auf einmal, außer dem Zusammenführen zweier Artikel.
- **Keine Gänge oder Karten im Markt.** Ein Markt legt weiter nur die Reihenfolge der Bereiche fest
  und kann Bereiche ausblenden.
- **Keine Änderung an Liste und Einkaufen** außer den Folgen von Umbenennen, Zusammenführen und
  Löschen; die Liste regelt Spec 0006.

## Konzept in Kürze

Grundlage ist das freigegebene UI-Konzept v2 (`docs/product/ui-konzept-v2.md`), Abschnitte 2.6,
3.3 (Zutaten nur aus dem Katalog, Hinweis), 3.9, 3.12 (Abkürzungen am Ort) und 4.2, mit der
Entscheidung D13 (ENTSCHIEDEN).

- **Zutaten nur aus dem Katalog (3.3, 4.2):** Menge tippen, Artikel per „Suchen oder anlegen“
  (Spec 0005) wählen. Wie die Suche trifft (Anfang, Teilwort, Tippfehler, Synonyme und Wortteile
  wie „Milchko“ → „Kokosmilch“) und wann sie bremst, regelt allein Spec 0005, REQ-006 (Offene
  Frage 5). Die Suche umfasst die Artikel des Haushalts und den Starter-Katalog; wählt
  man einen Katalog-Eintrag, entsteht der Haushalts-Artikel dabei mit dessen Angaben. Angezeigt
  wird immer der Artikelname. Was nur zu diesem Rezept gehört, steht im Einkaufs-Zusatz (geht auf
  die Liste) oder im neuen _Hinweis_ (nur fürs Kochen). Die Zutaten bleiben eine Liste im Rezept
  (Spec 0003, Entscheidung 8); der Server prüft beim Speichern, dass jede Zutat auf einen Artikel
  des eigenen Haushalts zeigt.
- **„Mehrere einfügen“** bleibt: Jede Zeile wird zerlegt und bekommt einen Artikel. Sicher passt
  ein Artikel, dessen Name oder Synonym genau dem Text entspricht (nach Groß/Klein und Satzzeichen
  vereinheitlicht, wie heute). Alles andere steht orange mit „Artikel wählen“ und wird erst
  gespeichert, wenn ein Artikel gewählt ist; der Rest schon. Diese Spec ist Eigentümerin der Regel
  (REQ-002); Spec 0008, AC-032 setzt sie im Abschnitt „Zutaten“ des neuen Editors ein, Spec 0009,
  AC-013 bei den eigenen Zutaten einer Sammlung.
- **Bestehende Freitext-Zutaten (D13 A):** Eine Migration ordnet jede Zutat ohne Artikel über Name
  und Synonyme einem Artikel des Haushalts oder einem Eintrag des Starter-Katalogs zu. Passt nichts,
  entsteht je Haushalt und Name genau ein neuer Artikel, markiert als „Neu aus Rezepten“. Die
  Artikel-Seite zeigt diese zum Prüfen und Zusammenführen.
- **Artikel (3.9):** neue Seite unter „Verwalten“ und über Liste ⋯. Suche, Filter-Chips „Alle ·
  Ohne Bereich · Vorrat · Neu aus Rezepten · Ähnliche Namen“, Zeile mit Name, Bereich, Ernährung,
  Kennzeichen „Vorrat“. „Artikel bearbeiten“ (Handy mittleres Fenster, Desktop rechte Spalte):
  Name, Synonyme, Bereich, Vorrat, Ernährungseigenschaft, Standard-Einkaufsregel, „In Rezepten“,
  „Zusammenführen mit …“, „Löschen“ nur, wenn unbenutzt. „Ähnliche Namen“ zeigt Artikel, deren Name
  oder Synonym einem anderen Artikel um einen Tippfehler gleicht (Ähnlichkeit mindestens 0,8) oder
  dessen Einzahl bzw. Mehrzahl ist, wie das heutige „Meinst du …?“; Wortteile zählen hier nicht,
  sonst stünde jede „Milch“ neben „Buttermilch“.
  _Nachtrag (plan.md, E13 und E14):_ „Ähnlich“ heißt hier und bei jedem „Meinst du …?“ gleich
  geschrieben — Wort für Wort gleich, Einzahl/Mehrzahl oder ein Tippfehler (ab 15 Buchstaben zwei,
  nie im ersten Buchstaben); „Fleischkäse“ und „Frischkäse“ sind nicht ähnlich. Wortteile lösen nie
  eine Bremse aus.
- **Märkte & Bereiche (3.9)** mit den Ansichts-Tabs „Märkte · Bereiche“. Markt: umbenennen, „Als
  Standard“, Laufreihenfolge per Ziehen und per Pfeilen, Bereich ausblenden, „+ Bereich
  hinzufügen“ (legt den Bereich bei Bedarf für den ganzen Haushalt an), „Markt löschen …“ mit
  Dialog. Bereiche gelten im
  ganzen Haushalt: anlegen, umbenennen, Reihenfolge ohne Markt, „Zusammenlegen mit …“, „Löschen …“
  mit Dialog, wenn Artikel betroffen sind.
- **Navigation (2.1, 3.12):** Beide Seiten gehören zu „Verwalten“, haben Tab-Leiste bzw. Seitenleiste
  und stehen am Desktop als Liste und Detail. Abkürzungen: Liste ⋯ → „Märkte & Bereiche“, „Artikel“
  (Spec 0006); „Märkte verwalten ›“ beim Einkaufen (Spec 0006); „Artikel bearbeiten“ an einer
  Zutat (hier).
- **Kritischer Pfad:** Migration bestehender Daten (D13), Löschen (Artikel, Bereiche, Märkte) und
  Zusammenführen (zieht Rezepte, Posten und Synonyme um und löscht die Quelle; wartende Laden-Aktionen
  müssen auf den Zielartikel zeigen). `plan.md` braucht ein Bedrohungsmodell, Negativtests (fremder
  Haushalt, abgemeldet, ungültige Eingabe, Fehlerfall) und einen `/security-check`.

**Bausteine aus Spec 0005:** „Suchen oder anlegen“ (Zutat, Bereich im Markt, neuer Artikel),
Filterzeile und Endlos-Liste (Artikel), Ansichts-Tabs (Märkte · Bereiche), Fenstergrößen
(„Artikel bearbeiten“ mittel, Löschen- und Zusammenführen-Dialoge klein), Liste und Detail am
Desktop, Eintrag „Artikel“ unter „Verwalten“.

**Was sich an älteren Specs ändert**

| Bisher                                                                                                                   | Neu                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Spec 0001, AC-022: eingefügte Zutaten werden zu Zeilen „mit Rezeptangabe und Artikel“                                    | ergänzt durch AC-008 bis AC-010: unsichere Zeilen stehen orange                |
| Spec 0001, AC-034: Laufreihenfolge ändern                                                                                | gilt weiter; AC-046 ergänzt Ziehen, Pfeile und Screenreader                    |
| Vision: „Ein Artikel entsteht automatisch, sobald irgendwo ein neuer Name eingegeben wird, im Rezept oder auf der Liste“ | im Rezept entsteht er bewusst über „„…“ neu anlegen“; auf der Liste wie bisher |
| Vorratscheck: „Nicht im Katalog – bitte von Hand eintragen“                                                              | entfällt, weil jede Zutat einen Artikel hat (AC-016)                           |

## Anforderungen und Akzeptanzkriterien

Daten wie im Beispielhaushalt „Enrico & Nadja“, ergänzt um das, was im jeweiligen Kriterium steht.
Handybreite heißt 390 × 844 px, Desktop 1440 × 900 px.

### REQ-001 — Zutat aus dem Artikel-Katalog wählen

> Eine Zutat bekommt ihren Artikel über „Suchen oder anlegen“; ohne Artikel lässt sie sich nicht
> speichern, und der Server nimmt nur Artikel des eigenen Haushalts an.

**Offline:** nur online (Rezept bearbeiten). Die Suche selbst liest aus dem lokalen Speicher.

**AC-001 — Artikel wählen**

```gherkin
Angenommen  „Mango-Curry“ wird bearbeitet; es gibt die Artikel „Kokosmilch“ und „Kokosmilch light“,
            beide im Bereich „Konserven & Saucen“
Wenn        ich „+ Zutat“ wähle, als Menge „400 ml“ tippe und im Feld „Artikel“ „Kokos“ tippe
Dann        stehen „Kokosmilch“ und „Kokosmilch light“ mit ihrem Bereich unter den Treffern
Wenn        ich „Kokosmilch“ wähle und speichere
Dann        steht im Rezept „400 ml Kokosmilch“ und die Zutat verweist auf den Artikel „Kokosmilch“
```

**AC-002 — Neu anlegen**

```gherkin
Angenommen  „Mango-Curry“ wird bearbeitet; es gibt weder einen Artikel noch einen Katalog-Eintrag
            „Drachenfrucht“
Wenn        ich als Artikel „Drachenfrucht“ tippe und „„Drachenfrucht“ neu anlegen“ wähle
Dann        gibt es den Artikel „Drachenfrucht“ ohne Bereich, mit Ernährungseigenschaft „unbekannt“
            und ohne Vorrat-Markierung
Und         die Zutat verweist darauf
Und         „Drachenfrucht“ steht auf der Seite „Artikel“, aber nicht unter „Neu aus Rezepten“
```

**AC-003 — Eintrag aus dem Starter-Katalog**

```gherkin
Angenommen  der Haushalt hat seinen Artikel „Kichererbsen“ gelöscht, der Starter-Katalog kennt
            „Kichererbsen“
Wenn        ich als Artikel „Kicher“ tippe
Dann        steht „Kichererbsen“ unter den Treffern
Wenn        ich „Kichererbsen“ wähle und speichere
Dann        gibt es wieder den Artikel „Kichererbsen“ mit Bereich, Ernährungseigenschaft,
            Vorrat-Markierung und Synonymen aus dem Starter-Katalog
```

**AC-004 — Fehlerfall: Zeile ohne Artikel**

```gherkin
Angenommen  „Mango-Curry“ wird bearbeitet; ich habe den Titel geändert und eine neue Zeile mit der
            Menge „1 TL“ und dem getippten Text „Zuckr“ angelegt, ohne einen Artikel zu wählen
Wenn        ich speichere
Dann        steht diese Zeile orange mit „Artikel wählen“ und wird nicht gespeichert
Und         der neue Titel ist gespeichert
```

**AC-005 — Einkaufsregel kommt vom Artikel** (Offene Frage 2)

```gherkin
Angenommen  der Artikel „Mehl“ hat die Standard-Einkaufsregel „Rezeptmenge“
Wenn        ich in einem Rezept „Mehl“ als Zutat wähle
Dann        ist für diese Zutat die Einkaufsregel „Rezeptmenge“ vorausgewählt
```

**AC-006 — Negativ: Server prüft den Artikel**

```gherkin
Angenommen  Enrico ist Mitglied von „Enrico & Nadja“, nicht von „WG Köln“
Wenn        er über die Supabase-API „Mango-Curry“ mit einer Zutat speichern will, die keinen
            Artikel hat, auf einen Artikel zeigt, den es nicht gibt, oder auf einen Artikel von „WG
            Köln“
Dann        lehnt der Server jede dieser Änderungen ab und „Mango-Curry“ bleibt unverändert
Und         eine ältere App-Version, die eine Zutat ohne Artikel speichern will, zeigt „Hat nicht
            geklappt – bitte noch einmal versuchen“
```

**AC-007 — Abkürzung „Artikel bearbeiten“**

```gherkin
Angenommen  „Mango-Curry“ wird bearbeitet und hat die Zutat „Kokosmilch“
Wenn        ich an dieser Zutat ⋯ → „Artikel bearbeiten“ wähle
Dann        öffnet sich „Artikel bearbeiten“ für „Kokosmilch“ (REQ-006)
Und         nach „Fertig“ bin ich wieder im Rezept
```

### REQ-002 — Mehrere Zutaten einfügen

> Beim Einfügen eines Blocks bekommt jede Zeile ihren Artikel, wenn er sicher passt; unsichere
> Zeilen stehen orange und werden erst mit gewähltem Artikel gespeichert.

**Offline:** nur online.

**AC-008 — Block mit sicheren und unsicheren Zeilen** (ergänzt Spec 0001, AC-022)

```gherkin
Angenommen  ein Rezept wird bearbeitet; es gibt die Artikel „Kokosmilch“, „Mango“ und „Salz“, aber
            keinen Artikel und keinen Katalog-Eintrag „Drachenfrüchte“ oder „Drachenfrucht“
Wenn        ich „200 ml Kokosmilch“, „1 Mango“, „1 Prise Salz“ und „2 Drachenfrüchte“ als Block
            einfüge
Dann        entstehen vier Zeilen
Und         „200 ml · Kokosmilch“, „1 · Mango“ und „1 Prise · Salz“ haben ihren Artikel
Und         „2 · Drachenfrüchte“ steht orange mit „Artikel wählen“ und dem Angebot „„Drachenfrüchte“
            neu anlegen“
```

**AC-009 — Nur ähnlich ist nicht sicher**

```gherkin
Angenommen  es gibt die Artikel „Kokosmilch“ und „Tomaten“
Wenn        ich „200 ml Kokosmilsch“ und „2 Tomate“ als Block einfüge
Dann        stehen beide Zeilen orange, mit „Meinst du Kokosmilch?“ bzw. „Meinst du Tomaten?“
Wenn        ich bei beiden „Ja“ wähle
Dann        verweisen die Zeilen auf „Kokosmilch“ bzw. „Tomaten“ und sind nicht mehr orange
```

**AC-010 — Teilweise speichern**

```gherkin
Angenommen  die vier Zeilen aus AC-008
Wenn        ich speichere
Dann        sind die drei Zeilen mit Artikel gespeichert
Und         „2 · Drachenfrüchte“ bleibt orange stehen mit dem Hinweis „1 Zutat braucht noch einen
            Artikel“
Wenn        ich den Editor verlasse, ohne die Zeile zu lösen
Dann        ist nur diese Zeile nicht gespeichert
```

### REQ-003 — Hinweis je Zutat

> Jede Zutat kann einen _Hinweis_ fürs Kochen haben („fein gehackt“); er steht im Rezept und geht
> nicht auf die Liste.

**Offline:** nur online (bearbeiten); offline lesbar.

**AC-011 — Hinweis im Rezept, nicht auf der Liste**

```gherkin
Angenommen  „Linsen-Dal“ hat die Zutat „2 Zwiebeln“ mit Einkaufsregel „Anzahl“
Wenn        ich als Hinweis „fein gehackt“ eintrage und speichere
Dann        steht im Rezept „2 Zwiebeln · fein gehackt“
Wenn        „Linsen-Dal“ auf die Einkaufsliste kommt
Dann        stehen im Vorratscheck und auf der Liste „Zwiebeln“ ohne „fein gehackt“
```

**AC-012 — Hinweis und Einkaufs-Zusatz sind getrennt**

```gherkin
Angenommen  „Käsekuchen“ hat „Frischkäse“ mit dem Einkaufs-Zusatz „Philadelphia“ und dem Hinweis
            „zimmerwarm“
Wenn        „Käsekuchen“ auf die Einkaufsliste kommt
Dann        steht dort „Frischkäse (Philadelphia)“ und nirgends „zimmerwarm“
Und         im Rezept steht der Hinweis „zimmerwarm“ an der Zutat
```

**AC-013 — Randfall: Portionen und leerer Hinweis**

```gherkin
Angenommen  „Linsen-Dal“ für 4 Portionen mit „2 Zwiebeln · fein gehackt“ und „150 g Rote Linsen“
            ohne Hinweis
Wenn        ich auf 8 Portionen stelle
Dann        steht dort „4 Zwiebeln · fein gehackt“ und „300 g Rote Linsen“ ohne „·“ dahinter
```

### REQ-004 — Bestehende Zutaten ohne Artikel überführen (D13)

> Eine Migration ordnet jede Zutat ohne gültigen Artikel einem Artikel zu; passt keiner, entsteht
> ein neuer, der unter „Neu aus Rezepten“ zum Prüfen steht.

**Offline:** läuft auf dem Server. Jedes Gerät lädt danach mit einer neuen Speicher-Version einmal
alles neu (Spec 0003, AC-018); ohne Netz zeigt es bis dahin den alten Stand.

**AC-014 — Name passt**

```gherkin
Angenommen  „Curry“ hat die Zutat „Kokosmilch“ ohne Artikel, Menge „400 ml“, Einkaufsregel
            „Rezeptmenge“, Einkaufs-Zusatz „Bio“, Variante „mit Tofu“, Gruppe „Soße“; der Haushalt
            hat den Artikel „Kokosmilch“
Wenn        die Migration läuft
Dann        verweist die Zutat auf „Kokosmilch“
Und         Menge, Einkaufsregel, Einkaufs-Zusatz, Variante und Gruppe sind unverändert
```

**AC-015 — Synonym passt**

```gherkin
Angenommen  „Gemüsesuppe“ hat die Zutat „Karotten“ ohne Artikel; der Artikel „Möhren“ hat das
            Synonym „Karotten“
Wenn        die Migration läuft
Dann        verweist die Zutat auf „Möhren“ und das Rezept zeigt „Möhren“
```

**AC-016 — Starter-Katalog passt, Vorratscheck übernimmt**

```gherkin
Angenommen  „Hummus“ hat die Zutat „Kichererbsen“ ohne Artikel; der Haushalt hat keinen Artikel
            dieses Namens, der Starter-Katalog schon
Wenn        die Migration läuft
Dann        gibt es den Artikel „Kichererbsen“ mit den Angaben des Starter-Katalogs, nicht unter
            „Neu aus Rezepten“
Und         „Hummus“ bringt „Kichererbsen“ im Vorratscheck mit, ohne „Nicht im Katalog“
```

**AC-017 — Nichts passt**

```gherkin
Angenommen  „Curry“ und „Dal“ haben je eine Zutat „Milchkokos“ ohne Artikel; es gibt keinen Artikel,
            kein Synonym und keinen Katalog-Eintrag dieses Namens
Wenn        die Migration läuft
Dann        gibt es genau einen neuen Artikel „Milchkokos“ ohne Bereich, mit Ernährungseigenschaft
            „unbekannt“ und ohne Vorrat-Markierung
Und         beide Zutaten verweisen darauf
Und         die Seite „Artikel“ zeigt „Milchkokos“ unter „Neu aus Rezepten (1)“
```

**AC-018 — Randfall: Verweis ins Leere, zweiter Lauf**

```gherkin
Angenommen  „Salat“ hat die Zutat „Feta“, die auf einen inzwischen gelöschten Artikel verweist; der
            Haushalt hat einen Artikel „Feta“
Wenn        die Migration läuft
Dann        verweist die Zutat auf den vorhandenen Artikel „Feta“
Wenn        die Migration ein zweites Mal läuft
Dann        ändert sich nichts und es entstehen keine weiteren Artikel
```

**AC-019 — Negativ: Haushaltsgrenze**

```gherkin
Angenommen  „WG Köln“ hat einen Artikel „Milchkokos“, „Enrico & Nadja“ nicht; „Curry“ von „Enrico &
            Nadja“ hat die Zutat „Milchkokos“ ohne Artikel
Wenn        die Migration läuft
Dann        verweist die Zutat auf einen neuen Artikel von „Enrico & Nadja“, nie auf den von „WG
            Köln“
```

**AC-020 — Randfall: sehr langer Name** (Offene Frage 6e)

```gherkin
Angenommen  eine Zutat ohne Artikel heißt „Tomaten, geschält, aus der Dose …“ mit 150 Zeichen
Wenn        die Migration läuft
Dann        entsteht ein Artikel mit den ersten 120 Zeichen dieses Namens unter „Neu aus Rezepten“
Und         die Zutat verweist darauf
```

### REQ-005 — Seite „Artikel“

> Die Seite „Artikel“ zeigt alle Artikel des Haushalts mit Suche, Sortierung und Filter-Chips; am
> Desktop als Liste und Detail.

**Offline:** offline lesend.

**AC-021 — Aufbau und Wege dorthin**

```gherkin
Angenommen  Handybreite
Wenn        ich „Verwalten“ → „Artikel“ öffne
Dann        sehe ich alle Artikel des Haushalts von A bis Z, je Zeile Name, Bereich,
            Ernährungseigenschaft und, wo gesetzt, das Kennzeichen „Vorrat“
Und         oben das Suchfeld „Artikel suchen …“, „↕ A–Z ▾“ und die Filter-Chips „Alle“, „Ohne
            Bereich (n)“, „Vorrat“, „Neu aus Rezepten (n)“ und „Ähnliche Namen (n)“
Und         die Tab-Leiste ist sichtbar
Wenn        ich stattdessen auf „Liste“ ⋯ → „Artikel“ wähle
Dann        öffnet sich dieselbe Seite und „Zurück“ führt zur Liste
```

**AC-022 — Suche**

```gherkin
Angenommen  die Seite „Artikel“
Wenn        ich „Karotten“ suche
Dann        steht „Möhren“ mit „auch: Karotten“ unter den Treffern
Wenn        ich „Kokosmilsh“ suche
Dann        steht „Kokosmilch“ unter den Treffern
```

**AC-023 — Filter**

```gherkin
Angenommen  „Geschenkpapier“ und „Drachenfrucht“ haben keinen Bereich; es gibt die Artikel „Zwiebel“
            und „Zwiebeln“
Wenn        ich „Ohne Bereich (2)“ wähle
Dann        stehen nur „Drachenfrucht“ und „Geschenkpapier“ in der Liste
Wenn        ich „Ähnliche Namen“ wähle
Dann        stehen dort „Zwiebel · ähnlich wie Zwiebeln“ und „Zwiebeln · ähnlich wie Zwiebel“
```

**AC-024 — Sortierung** (Offene Frage 5)

```gherkin
Angenommen  die Seite „Artikel“, sortiert nach „A–Z“
Wenn        ich „↕ A–Z ▾“ → „Neu“ wähle
Dann        steht der zuletzt angelegte Artikel oben
```

**AC-025 — Liste und Detail am Desktop**

```gherkin
Angenommen  Desktopbreite, die Seite „Artikel“, „Artikel“ ist in der Seitenleiste hervorgehoben
Wenn        ich „Kokosmilch“ wähle
Dann        steht „Artikel bearbeiten“ für „Kokosmilch“ in der rechten Spalte, die Liste bleibt
            links
Und         „Artikel“ bleibt in der Seitenleiste hervorgehoben
```

**AC-026 — Neu anlegen und viele Artikel**

```gherkin
Angenommen  der Haushalt hat mehr als 300 Artikel
Wenn        ich die Seite öffne und bis ans Ende scrolle
Dann        gibt es keine Seiten und keinen Knopf „Mehr laden“ (Endlos-Liste, Spec 0005)
Wenn        ich „+ Neu“ wähle und „Drachenfrucht“ eingebe
Dann        ist „Drachenfrucht“ angelegt und „Artikel bearbeiten“ ist für sie offen
```

**AC-027 — Randfall: leerer Filter**

```gherkin
Angenommen  kein Artikel ist „Neu aus Rezepten“
Wenn        ich „Neu aus Rezepten (0)“ wähle
Dann        sehe ich einen leeren Zustand mit dem Weg zurück zu „Alle“
```

### REQ-006 — Artikel bearbeiten und löschen

> „Artikel bearbeiten“ ändert Name, Synonyme, Bereich, Vorrat, Ernährungseigenschaft und
> Standard-Einkaufsregel, zeigt die Rezepte des Artikels und löscht ihn nur, wenn er unbenutzt ist.

**Offline:** nur online (bearbeiten, löschen); offline lesbar, Felder ausgegraut mit „Offline – zum
Bearbeiten brauchst du Netz“.

**AC-028 — Fenster**

```gherkin
Angenommen  Handybreite; „Kokosmilch“ liegt in „Konserven & Saucen“, ist vegan, ohne Vorrat,
            Einkaufsregel „Anzahl“, und steht in „Mango-Curry“ und „Linsen-Dal“
Wenn        ich auf „Artikel“ „Kokosmilch“ öffne
Dann        zeigt das mittlere Fenster „Artikel bearbeiten“ Name, Synonyme als Chips, Bereich,
            Vorrat, Ernährungseigenschaft, Standard-Einkaufsregel, „In Rezepten: Mango-Curry,
            Linsen-Dal“, „Zusammenführen mit …“ und „Löschen“
Wenn        ich „Linsen-Dal“ wähle
Dann        öffnet sich das Rezept „Linsen-Dal“
```

**AC-029 — Umbenennen**

```gherkin
Angenommen  „Milchkokos“ steht in „Curry“ und offen auf der Liste
Wenn        ich „Milchkokos“ in „Kokosnussmilch“ umbenenne und „Fertig“ wähle
Dann        zeigen „Curry“ und die Liste „Kokosnussmilch“, auch bei Nadja
Und         „Milchkokos“ ist nicht mehr unter „Neu aus Rezepten“ (Offene Frage 1)
```

**AC-030 — Fehlerfall: Name gibt es schon**

```gherkin
Angenommen  es gibt „Kokosmilch“ und „Milchkokos“
Wenn        ich „Milchkokos“ in „kokosmilch“ umbenennen will
Dann        wird nichts gespeichert und das Feld zeigt „Gibt es schon: Kokosmilch“ mit
            „Zusammenführen …“
Wenn        ich den Namen leere
Dann        lässt sich „Fertig“ nicht wählen und das Feld zeigt „Name fehlt“
```

**AC-031 — Synonyme**

```gherkin
Angenommen  „Kokosmilch“ ohne Synonyme
Wenn        ich das Synonym „Kokos-Milch“ hinzufüge
Dann        findet die Suche in „Was fehlt?“ und auf „Artikel“ mit „Kokos-Milch“ den Artikel
            „Kokosmilch“
Wenn        ich als weiteres Synonym „Möhren“ hinzufügen will, den Namen eines anderen Artikels
Dann        wird es nicht gespeichert und es erscheint „„Möhren“ ist schon ein Artikel“
Wenn        ich am Chip „Kokos-Milch“ ✕ wähle
Dann        findet „Kokos-Milch“ den Artikel nicht mehr
```

**AC-032 — Bereich, Vorrat und Ernährung wirken überall**

```gherkin
Angenommen  „Milchkokos“ ohne Bereich steht offen auf der Liste; „Curry“ enthält nur vegane Artikel
            und „Milchkokos“ mit Ernährungseigenschaft „unbekannt“
Wenn        ich für „Milchkokos“ den Bereich „Konserven & Saucen“, „Vorrat“ und „vegan“ setze
Dann        steht „Milchkokos“ auf der Liste unter „Konserven & Saucen“
Und         im nächsten Vorratscheck mit „Curry“ steht „Milchkokos“ unter „Vorrat & Gewürze“,
            abgewählt
Und         „Curry“ erscheint im Filter „Vegan“
```

**AC-033 — Unbenutzt löschen**

```gherkin
Angenommen  „Drachenfrucht“ steht in keinem Rezept und nicht auf der Liste, weder offen noch
            erledigt
Wenn        ich „Löschen“ wähle
Dann        ist „Drachenfrucht“ verschwunden, auch bei Nadja
Und         ein Hinweis bietet 5 Sekunden „Rückgängig“ an
```

**AC-034 — Fehlerfall: benutzt kann man nicht löschen**

```gherkin
Angenommen  „Kokosmilch“ steht in zwei Rezepten, „Milch“ steht nur offen auf der Liste
Wenn        ich „Kokosmilch“ öffne
Dann        ist „Löschen“ ausgegraut mit „Wird in 2 Rezepten verwendet – zusammenführen statt
            löschen“
Wenn        ich „Milch“ öffne
Dann        ist „Löschen“ ausgegraut mit „Steht auf der Einkaufsliste“
```

**AC-035 — Konflikt: zwei Personen bearbeiten gleichzeitig**

```gherkin
Angenommen  Enrico und Nadja haben „Artikel bearbeiten“ für „Milchkokos“ offen, beide mit Netz
Wenn        Enrico den Bereich „Konserven & Saucen“ setzt und Nadja gleichzeitig den Namen in
            „Kokosnussmilch“ ändert
Dann        hat der Artikel danach beides: den Namen „Kokosnussmilch“ und den Bereich „Konserven &
            Saucen“
```

### REQ-007 — Artikel zusammenführen

> „Zusammenführen mit …“ macht aus zwei Artikeln einen: Rezepte, Posten und Synonyme ziehen zum
> Ziel, der Name der Quelle wird ein Synonym, die Quelle verschwindet.

**Offline:** nur online, in einer Transaktion.

**AC-036 — Zusammenführen** (Offene Frage 3)

```gherkin
Angenommen  „Milchkokos“ (Synonym „Kokosdrink“) steht in „Curry“ und offen auf der Liste mit „von
            Hand: 1×“ und dem Zusatz „Bio“; „Kokosmilch“ steht in „Mango-Curry“ und offen auf der
            Liste mit „Mango-Curry (Sa): 1×“
Wenn        ich bei „Milchkokos“ „Zusammenführen mit …“ wähle, „Kokosmilch“ suche und wähle
Dann        fragt ein kleines Fenster „Milchkokos in Kokosmilch zusammenführen?“ mit „1 Rezept und 1
            Posten ziehen um. Das lässt sich nicht rückgängig machen.“, „Abbrechen“ und
            „Zusammenführen“
Wenn        ich „Zusammenführen“ wähle
Dann        verweist die Zutat in „Curry“ auf „Kokosmilch“
Und         auf der Liste steht eine Zeile „Kokosmilch (Bio)“ mit 2× und beiden Beiträgen
Und         „Kokosmilch“ hat die Synonyme „Milchkokos“ und „Kokosdrink“, den Artikel „Milchkokos“
            gibt es nicht mehr
```

**AC-037 — Danach findet der alte Name das Ziel**

```gherkin
Angenommen  „Milchkokos“ wurde in „Kokosmilch“ zusammengeführt
Wenn        ich in „Was fehlt?“ „Milchkokos“ eingebe und bestätige
Dann        kommt „Kokosmilch“ auf die Liste und es entsteht kein neuer Artikel
```

**AC-038 — Eigenschaften** (Offene Frage 6b)

```gherkin
Angenommen  „Kokosmilch“ ohne Bereich, vegan; „Milchkokos“ in „Konserven & Saucen“, Ernährung
            „unbekannt“, als Vorrat markiert
Wenn        ich „Milchkokos“ in „Kokosmilch“ zusammenführe
Dann        liegt „Kokosmilch“ in „Konserven & Saucen“, bleibt vegan und ist nicht als Vorrat
            markiert
```

**AC-039 — Randfall: beide im selben Rezept**

```gherkin
Angenommen  „Curry“ hat „200 ml Milchkokos“ und „400 ml Kokosmilch“
Wenn        ich „Milchkokos“ in „Kokosmilch“ zusammenführe
Dann        hat „Curry“ zwei Zeilen „200 ml Kokosmilch“ und „400 ml Kokosmilch“ mit ihren übrigen
            Angaben
```

**AC-040 — Laden-Warteschlange über das Zusammenführen hinweg**

```gherkin
Angenommen  Nadja ist ohne Netz in „Einkaufen“ und hakt „Milchkokos“ ab
Wenn        Enrico „Milchkokos“ mit Netz in „Kokosmilch“ zusammenführt und Nadjas Gerät danach
            wieder Netz hat
Dann        ist die Zeile „Kokosmilch“ auf der Liste abgehakt, für alle
Und         Nadja sieht keine Fehlermeldung
```

**AC-041 — Negativ: sich selbst und fremder Haushalt**

```gherkin
Angenommen  „Milchkokos“ gehört zu „Enrico & Nadja“, „Kokosnuss“ zu „WG Köln“; „Zusammenführen mit
            …“ für „Milchkokos“ ist offen
Wenn        ich „Milchkokos“ suche
Dann        steht „Milchkokos“ nicht unter den Treffern
Wenn        Enrico, nur Mitglied von „Enrico & Nadja“, über die Supabase-API „Milchkokos“ mit
            „Kokosnuss“ zusammenführen will
Dann        lehnt der Server ab und an beiden Artikeln ändert sich nichts
```

### REQ-008 — Märkte

> Auf „Märkte & Bereiche“ → „Märkte“ lassen sich Märkte anlegen, umbenennen, als Standard setzen und
> löschen.

**Offline:** offline lesend; Bearbeiten nur online.

**AC-042 — Aufbau und Wege dorthin**

```gherkin
Angenommen  Desktopbreite
Wenn        ich in der Seitenleiste „Märkte & Bereiche“ wähle
Dann        stehen oben die Ansichts-Tabs „Märkte · Bereiche“ mit „Märkte“ aktiv
Und         links jeder Markt mit „n Bereiche · m ausgeblendet“, beim Standardmarkt zusätzlich
            „Standard“, darunter „+ Neuer Markt“
Und         rechts die Laufreihenfolge des gewählten Markts (REQ-009)
Wenn        ich stattdessen in „Einkaufen“ „Märkte verwalten ›“ wähle
Dann        öffnet sich dieselbe Seite mit Tab-Leiste bzw. Seitenleiste
```

**AC-043 — Neuer Markt**

```gherkin
Angenommen  „Märkte“ ist offen
Wenn        ich „+ Neuer Markt“ wähle und „dm“ eingebe
Dann        gibt es den Markt „dm“; seine Laufreihenfolge enthält alle Bereiche des Haushalts in
            der Reihenfolge ohne Markt, keiner ausgeblendet
Wenn        ich einen Markt ohne Namen anlegen will
Dann        wird nichts angelegt und das Feld zeigt „Name fehlt“
```

**AC-044 — Umbenennen und als Standard**

```gherkin
Angenommen  „Rewe Südstadt“ ist Standardmarkt, Nadjas Gerät hat noch nie einen Markt gewählt
Wenn        ich „Aldi Nord“ öffne, über ✎ in „Aldi Nordstadt“ umbenenne und ⋯ → „Als Standard“ wähle
Dann        steht „Standard“ bei „Aldi Nordstadt“ und nicht mehr bei „Rewe Südstadt“
Und         Nadjas „Einkaufen“ zeigt „Aldi Nordstadt ▾“
```

**AC-045 — Markt löschen** (Fehlerfall: Standardmarkt)

```gherkin
Angenommen  „Rewe Südstadt“ ist der Standardmarkt und der einzige Markt
Wenn        ich ⋯ → „Markt löschen …“ wähle
Dann        fragt ein kleines Fenster „Rewe Südstadt löschen?“ mit „Die Laufreihenfolge geht
            verloren.“, „Abbrechen“ und „Löschen“
Wenn        ich „Löschen“ wähle
Dann        ist „Rewe Südstadt“ weg und der Haushalt hat keinen Standardmarkt
Und         auf einem Gerät ohne eigene Wahl zeigt „Einkaufen“ „Ohne Markt – nach Bereichen“
```

### REQ-009 — Laufreihenfolge eines Markts

> Im Markt lassen sich die Bereiche in Laufreihenfolge ziehen, ausblenden und hinzufügen; ein neuer
> Bereich entsteht dabei für den ganzen Haushalt.

**Offline:** offline lesend; Bearbeiten nur online.

**AC-046 — Ziehen, Pfeile und Screenreader** (ergänzt Spec 0001, AC-034)

```gherkin
Angenommen  im Markt „Rewe Südstadt“ steht „Getränke“ an Position 4 von 14
Wenn        ich „Getränke“ am Griff ≡ an die erste Stelle ziehe
Dann        steht „Getränke“ in der Laufreihenfolge und in „Einkaufen“ bei „Rewe Südstadt“ als
            erste Gruppe
Wenn        ich stattdessen „Getränke“ mit der Tastatur fokussiere und dreimal „nach oben“ wähle
Dann        steht „Getränke“ ebenfalls an Position 1
Und         der Screenreader sagt „Getränke, Position 1 von 14“
```

**AC-047 — Ausblenden und Einblenden**

```gherkin
Angenommen  „Tierbedarf“ ist in der Laufreihenfolge von „Rewe Südstadt“ sichtbar, „Katzenfutter“
            liegt darin und steht offen auf der Liste
Wenn        ich bei „Tierbedarf“ „Ausblenden“ wähle
Dann        steht „Tierbedarf“ unter „Ausgeblendet“
Und         in „Einkaufen“ bei „Rewe Südstadt“ steht „Katzenfutter“ unter „Woanders kaufen“
Und         in anderen Märkten ändert sich nichts
Wenn        ich „Tierbedarf“ wieder einblende
Dann        steht es an seiner früheren Stelle in der Laufreihenfolge
```

**AC-048 — Bereich hinzufügen: neu**

```gherkin
Angenommen  der Markt „Rewe Südstadt“, es gibt keinen Bereich „Backzutaten“
Wenn        ich „+ Bereich hinzufügen“ wähle, „Backzutaten“ tippe und „„Backzutaten“ neu anlegen“
            wähle
Dann        gibt es im Haushalt den Bereich „Backzutaten“
Und         er steht in der Laufreihenfolge von „Rewe Südstadt“ an letzter Stelle
Und         unter „Bereiche“ mit „0 Artikel“ und in jedem anderen Markt am Ende der Laufreihenfolge
```

**AC-049 — Bereich hinzufügen: ausgeblendeter**

```gherkin
Angenommen  „Tierbedarf“ ist bei „Rewe Südstadt“ ausgeblendet
Wenn        ich „+ Bereich hinzufügen“ wähle und „Tierb“ tippe
Dann        steht „Tierbedarf · ausgeblendet“ unter den Treffern
Wenn        ich ihn wähle
Dann        ist „Tierbedarf“ bei „Rewe Südstadt“ wieder sichtbar und kein neuer Bereich ist
            entstanden
```

**AC-050 — Konflikt: zwei ordnen gleichzeitig**

```gherkin
Angenommen  Enrico und Nadja haben „Rewe Südstadt“ mit Netz offen
Wenn        Enrico „Getränke“ nach oben zieht und kurz danach Nadja „Brot & Backwaren“ nach oben
            zieht
Dann        gilt auf beiden Geräten Nadjas Laufreihenfolge, so wie sie ihn gesehen hat
```

### REQ-010 — Bereiche verwalten

> Auf „Märkte & Bereiche“ → „Bereiche“ lassen sich Bereiche des Haushalts anlegen, umbenennen, ohne
> Markt ordnen, zusammenlegen und löschen.

**Offline:** offline lesend; Bearbeiten nur online.

**AC-051 — Aufbau**

```gherkin
Angenommen  „Märkte & Bereiche“ ist offen
Wenn        ich „Bereiche“ wähle
Dann        steht jeder Bereich in der Reihenfolge ohne Markt mit der Zahl seiner Artikel und ⋯
            („Umbenennen“, „Zusammenlegen mit …“, „Löschen …“), darunter „Ohne Bereich · n Artikel
            ›“ und „+ Neuer Bereich“
Wenn        ich „Ohne Bereich ›“ wähle
Dann        öffnet sich „Artikel“ mit dem Filter „Ohne Bereich“
```

**AC-052 — Neu, umbenennen und Fehlerfall Doppelte** (Offene Frage 4)

```gherkin
Angenommen  es gibt die Bereiche „Getränke“ und „Kühlung“
Wenn        ich „+ Neuer Bereich“ wähle und „Backzutaten“ eingebe
Dann        steht „Backzutaten“ am Ende der Reihenfolge ohne Markt
Wenn        ich „Kühlung“ in „Kühlregal“ umbenenne
Dann        behalten alle Artikel ihren Bereich und Liste und Einkaufen zeigen „Kühlregal“
Wenn        ich einen Bereich „getränke“ anlegen oder „Kühlregal“ in „Getränke“ umbenennen will
Dann        wird nichts gespeichert und das Feld zeigt „Gibt es schon: Getränke“
```

**AC-053 — Reihenfolge ohne Markt**

```gherkin
Angenommen  „Getränke“ steht in der Reihenfolge ohne Markt an Position 5
Wenn        ich „Getränke“ an die erste Stelle ziehe
Dann        steht „Getränke“ auf „Liste“ und in „Einkaufen“ mit „Ohne Markt – nach Bereichen“ zuerst
Und         die Laufreihenfolgen der Märkte sind unverändert
```

**AC-054 — Zusammenlegen** (Offene Frage 3)

```gherkin
Angenommen  „Drogerie“ hat 12 Artikel, „Drogerie & Hygiene“ 20
Wenn        ich bei „Drogerie“ ⋯ → „Zusammenlegen mit …“ wähle und „Drogerie & Hygiene“ wähle
Dann        fragt ein kleines Fenster „Drogerie in Drogerie & Hygiene zusammenlegen? 12 Artikel
            ziehen um.“ mit „Abbrechen“ und „Zusammenlegen“
Wenn        ich „Zusammenlegen“ wähle
Dann        hat „Drogerie & Hygiene“ 32 Artikel und „Drogerie“ gibt es nicht mehr, auch in keiner
            Laufreihenfolge
Und         „Drogerie & Hygiene“ behält in jedem Markt seine Stelle und seine Sichtbarkeit
```

**AC-055 — Löschen mit Artikeln**

```gherkin
Angenommen  „Tierbedarf“ hat 12 Artikel
Wenn        ich ⋯ → „Löschen …“ wähle
Dann        fragt ein kleines Fenster „Tierbedarf löschen?“ mit „12 Artikel stehen danach unter
            ‚Ohne Bereich‘.“, „Abbrechen“ und „Löschen“
Wenn        ich „Löschen“ wähle
Dann        gibt es „Tierbedarf“ nicht mehr, auch in keiner Laufreihenfolge
Und         die 12 Artikel stehen unter „Ohne Bereich“
```

**AC-056 — Randfall: leerer Bereich und fremder Haushalt**

```gherkin
Angenommen  „Deko“ von „Enrico & Nadja“ hat keine Artikel; „WG Köln“ hat den Bereich „Keller“;
            Enrico ist nur Mitglied von „Enrico & Nadja“
Wenn        Enrico bei „Deko“ ⋯ → „Löschen …“ wählt
Dann        ist „Deko“ ohne Rückfrage gelöscht und ein Hinweis bietet 5 Sekunden „Rückgängig“ an
Wenn        Enrico über die Supabase-API „Keller“ umbenennen, zusammenlegen oder löschen will, auch
            ohne Anmeldung
Dann        lehnt der Server jedes Mal ab und „Keller“ bleibt unverändert
```

## Offline und Konflikte

| Aktion                                             | Offline                                   | Konfliktregel (`docs/architecture/sync.md`)                                                            |
| -------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Artikel, Märkte, Bereiche lesen und suchen         | offline vollständig                       | —                                                                                                      |
| Zutat wählen, Hinweis, Rezept speichern            | nur online                                | die Zutatenliste eines Rezepts ist ein Feld: letzte Änderung gewinnt (Spec 0003, Entscheidung 8)       |
| Artikel bearbeiten, Märkte und Bereiche bearbeiten | nur online                                | letzte Änderung gewinnt je Feld; die Laufreihenfolge eines Markts ist ein Feld (AC-050)                |
| Zusammenführen, Löschen                            | nur online, je eine Transaktion           | siehe unten                                                                                            |
| Bereich zuordnen beim Einkaufen                    | offline vollständig (Laden-Warteschlange) | letzte Änderung gewinnt; ist der Bereich inzwischen gelöscht, wird die Zuordnung ohne Fehler verworfen |

- **Zusammenführen während offline gewartet wird:** Ein Haken, „nicht da“ oder ein hinzugefügter
  Posten für den Quellartikel zeigt nach dem Zusammenführen auf das Ziel (AC-040). Ein offline
  getippter Name der Quelle findet über das neue Synonym das Ziel (AC-037).
- **Löschen eines Artikels,** während ein anderes Gerät ihn in ein Rezept einsetzt: Der Server lehnt
  das Speichern des Rezepts ab (AC-006); die App zeigt „Hat nicht geklappt – bitte noch einmal
  versuchen“ und die Zeile wird wieder orange.
- **Die Migration** läuft auf dem Server; Geräte laden danach einmal voll neu.

## Plattformen

- **Handy:** „Artikel bearbeiten“ als mittleres Fenster. Laufreihenfolge und Reihenfolge ohne
  Markt per Ziehen am Griff ≡, mit Haptik beim Ablegen; die Alternative sind die Pfeile „nach oben“
  und „nach unten“.
- **Tablet und Desktop:** Liste und Detail nebeneinander (Artikel; Märkte mit Laufreihenfolge
  rechts). Ziehen mit der Maus; mit der Tastatur Fokus auf einen Bereich und Pfeile.
- **Screenreader:** Jede neue Position wird angesagt („Getränke, Position 1 von 14“).
- **Android:** Die Zurück-Taste schließt erst ein offenes Fenster, dann die Seite.

## Daten

- **Rezepte:** Jede Zutat verweist künftig zwingend auf einen Artikel des eigenen Haushalts; der
  bisherige Freitext-Name wird nicht mehr angezeigt (erweitern → umziehen → aufräumen: er bleibt,
  bis keine App-Version ihn mehr liest). Neu ist das optionale Feld _Hinweis_ an der Zutat.
- **Artikel:** neu die Standard-Einkaufsregel und die Markierung „Neu aus Rezepten“. Geschrieben
  werden Name, Synonyme, Bereich, Vorrat, Ernährungseigenschaft und Standard-Einkaufsregel.
  Gelöscht werden Artikel, die unbenutzt sind, und beim Zusammenführen die Quelle.
- **Bereiche:** anlegen, umbenennen, Reihenfolge ohne Markt, zusammenlegen (löscht die Quelle),
  löschen (ihre Artikel verlieren den Bereich).
- **Märkte:** anlegen, umbenennen, Standardmarkt des Haushalts, Laufreihenfolge, ausgeblendete
  Bereiche, löschen (der Standardmarkt entfällt, wenn er gelöscht wird).
- **Migration in einfachen Worten:** Jede Zutat ohne gültigen Artikel bekommt einen: zuerst ein
  Artikel des Haushalts mit gleichem Namen oder Synonym, dann ein Eintrag des Starter-Katalogs, sonst
  ein neuer Artikel je Haushalt und Name, markiert „Neu aus Rezepten“. Menge, Einkaufsregel,
  Einkaufs-Zusatz, Variante und Gruppe bleiben. Danach nimmt der Server nur noch Zutaten mit Artikel
  an; ältere App-Versionen, die Freitext speichern wollen, bekommen einen Fehler.
- **Löschen und Zusammenführen** erreichen die Geräte über das Löschprotokoll.
- Keine personenbezogenen Daten.

## Offene Fragen

| #   | Frage                                                                                                                | Optionen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Empfehlung                                                                 | Status                          |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------- |
| 1   | Wann verlässt ein Artikel „Neu aus Rezepten“?                                                                        | A: sobald man ihn in „Artikel bearbeiten“ speichert, mit „Passt so“ bestätigt, zusammenführt oder löscht — Pro: wer ihn angesehen hat, hat geprüft; Contra: versehentliches Speichern zählt als geprüft · B: nur durch Zusammenführen oder Löschen — Pro: eindeutig; Contra: richtige Artikel stehen dort für immer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | A, weil die Liste sonst nie leer wird                                      | OFFEN, Annahme A                |
| 2   | Woher kommt die Standard-Einkaufsregel eines Artikels?                                                               | A: gespeichert am Artikel; in „Artikel bearbeiten“ änderbar, und jede Wahl in einem Rezept setzt sie neu (Vision: „zuletzt gewählte Regel wird vorgeschlagen“) — Pro: erfüllt Vision und Konzept; Contra: eine Wahl im Rezept ändert still den Artikel · B: nur von Hand gesetzt — Pro: nichts ändert sich still; Contra: die Vision-Regel entfällt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | A, weil die Vision die Regel schon festlegt                                | OFFEN, Annahme A                |
| 3   | Wie wird Zusammenführen (Artikel und Bereiche) abgesichert?                                                          | A: kleines Fenster mit den Folgen, ohne „Rückgängig“ — Pro: bewusst, ehrlich; Contra: ein Dialog mehr (DESIGN.md: Dialoge nur für Massen-Löschen) · B: sofort, mit 5 s „Rückgängig“ — Pro: wie sonst üblich; Contra: Rückgängig müsste Artikel, Verweise, Posten und Synonyme wiederherstellen, fehleranfällig                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | A, weil Zusammenführen wie ein Löschen mit vielen Folgen wirkt             | OFFEN, Annahme A                |
| 4   | Sind Bereichsnamen je Haushalt eindeutig?                                                                            | A: ja, ohne Groß/Klein wie bei Artikeln; geprüft beim Anlegen und Umbenennen; schon vorhandene Doppelte bleiben, bis man sie zusammenlegt — Pro: keine neuen Doppelten; Contra: die Datenbank muss mit Altbestand umgehen · B: Doppelte erlaubt — Pro: nichts zu prüfen; Contra: zwei „Getränke“ in der Laufreihenfolge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | A, weil „Suchen oder anlegen“ Doppelte ohnehin vermeiden soll              | OFFEN, Annahme A                |
| 5   | Welche Sortierungen hat die Seite „Artikel“?                                                                         | A: Menü „↕ A–Z ▾“ mit „A–Z“ und „Neu“ — Pro: Neues schnell finden; Contra: ein Menü mehr · B: nur A–Z — Pro: am ruhigsten; Contra: Konzept 2.4 nennt Sortieren in Artikel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | A, weil das Konzept ein Sortier-Menü vorsieht und „Neu“ beim Prüfen hilft  | OFFEN, Annahme A                |
| 6   | Kleinere Auslegungen, die das Konzept offenlässt                                                                     | (a) „Sicher passt“ heißt: Name oder Synonym gleich nach Vereinheitlichung (wie die heutige Namenssuche) · (b) Beim Zusammenführen behält das Ziel seine Angaben; nur leere Angaben (kein Bereich, Ernährung „unbekannt“) füllt die Quelle; Vorrat bleibt wie am Ziel · (c) Stehen Quelle und Ziel im selben Rezept, bleiben beide Zeilen · (d) Eine orange Zeile ohne Artikel wird beim Verlassen des Editors nicht gespeichert (Spec 0008, AC-032 übernimmt das) · (e) Namen über 120 Zeichen (Grenze für Artikelnamen) kürzt die Migration auf 120 Zeichen · (f) Ein wieder eingeblendeter Bereich steht an seiner früheren Stelle · (g) Ein neuer Markt übernimmt die Reihenfolge ohne Markt; ein neuer Bereich steht in jedem Markt am Ende · (h) Eine offline gemachte Bereichszuordnung auf einen inzwischen gelöschten Bereich wird ohne Fehler verworfen | wie beschrieben, weil es die kleinste Lösung ist, die zum Konzept passt    | OFFEN, Annahmen (a) bis (h)     |
| 7   | Was wird aus REQ-004, wenn es keine Altdaten gibt (ADR-0012)?                                                        | A: keine Migration; dieselbe Zuordnungsregel (Name/Synonym → Starter-Katalog → neuer Artikel „Neu aus Rezepten“, Name auf 120 Zeichen gekürzt) gilt überall, wo Zutaten ohne Wahl durch einen Menschen entstehen: Starter-Rezepte übernehmen, Vorschläge des Assistenten, Beispieldaten; AC-014 bis AC-020 prüfen diese Regel statt einer Migration — Pro: kein Code für Daten, die es nie gab; „Neu aus Rezepten“ bleibt sinnvoll (KI-Vorschläge prüfen) · B: REQ-004 und „Neu aus Rezepten“ ersatzlos streichen — Pro: am kleinsten; Contra: neue Artikel aus Vorschlägen stehen ungeprüft im Katalog                                                                                                                                                                                                                                                          | A, weil die Regel ohnehin für Starter-Rezepte und Assistent gebraucht wird | OFFEN, Annahme A (plan.md)      |
| 8   | Bleibt der Freitext-Name an der Zutat (Abschnitt „Daten“: erweitern → umziehen → aufräumen)?                         | A: nein, `name` entfällt sofort; angezeigt wird der Artikelname; AC-006 „ältere App-Version“ entfällt, weil keine ausgeliefert ist, geprüft wird stattdessen die Ablehnung über die API · B: Feld bleibt bis nach der ersten Auslieferung — Contra: Altlast ohne Leser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A, weil nichts ausgeliefert ist (ADR-0012)                                 | OFFEN, Annahme A (plan.md)      |
| 9   | Wie erreicht ein offline gemachter Haken auf die Quelle das Ziel (AC-040)?                                           | A: Steht der Quellartikel und der Zielartikel offen auf der Liste, bleibt der Posten des Ziels; der Grabstein des Quellpostens nennt ihn (`deleted_records.replaced_by`), Abhaken und „nicht da“ folgen dem Verweis. Ein Zurücknehmen auf einen so ersetzten Posten bleibt wirkungslos, eine offline gemachte Bereichszuordnung des Quellartikels wird ohne Fehler verworfen · B: Gerät schreibt seine Warteschlange nach dem Abgleich um — Contra: geht nicht, wenn das Gerät vor dem Abgleich sendet                                                                                                                                                                                                                                                                                                                                                           | A, weil der Server den Verweis in derselben Transaktion schreibt           | OFFEN, Annahme A (plan.md)      |
| 10  | Wie streng prüft die Datenbank Namen von Bereichen und Synonyme (Frage 4, AC-031)?                                   | A: Bereiche eindeutig je Haushalt über `lower(name)`; Name und Synonyme eines Artikels kollidieren mit keinem Namen oder Synonym eines anderen Artikels (Trigger, `name_taken`); die App prüft vorher mit `normalizeText` und zeigt „Gibt es schon …“ · B: nur die App prüft — Contra: zwei Geräte gleichzeitig erzeugen Doppelte, „Was fehlt?“ trifft dann zufällig                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | A                                                                          | OFFEN, Annahme A (plan.md)      |
| 11  | Was passiert, wenn das Ziel beim Zusammenführen mehr als 30 Synonyme hätte?                                          | A: Der Server lehnt ab, nichts ändert sich, die App zeigt „Zu viele Synonyme – entferne zuerst welche bei Kokosmilch“ · B: überzählige Synonyme still verwerfen — Contra: Namen gehen still verloren                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | A                                                                          | OFFEN, Annahme A (plan.md)      |
| 12  | Welcher Text erscheint, wenn ein Artikel gelöscht wurde, während ein anderes Gerät ihn auf die Liste setzt?          | A: „Den Artikel gibt es nicht mehr – bitte noch einmal hinzufügen“, das Hinzufügen springt zurück, kein erneuter Versuch — Pro: sagt, was passiert ist und was zu tun ist; Contra: ein Text mehr · B: allgemeines „Hat nicht geklappt – bitte noch einmal versuchen“ — Pro: kein neuer Text; Contra: der Grund bleibt unklar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A                                                                          | OFFEN, Annahme A (plan.md, D-h) |
| 13  | Wie wird ein zu langer Name gekürzt, wenn Umlaute den Schlüssel länger machen (AC-020)?                              | A: so viele Zeichen wie möglich bis 120, aber so, dass auch der Schlüssel höchstens 120 Zeichen hat („ä“ → „ae“) — Pro: die Datenbank nimmt den Artikel an; Contra: manchmal weniger als 120 Zeichen · B: genau 120 Zeichen — Contra: die Datenbank lehnt ab (`articles_name_key_valid`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | A                                                                          | OFFEN, Annahme A (plan.md, T3)  |
| 14  | Was nimmt „Rückgängig“ zurück, wenn der Befehl dabei einen Artikel angelegt hat (z. B. Zutat mit „„…“ neu anlegen“)? | A: alles außer dem neuen Artikel; er bleibt im Katalog — Pro: Löschen geht nur über `delete_article` (E4), Rückgängig scheitert nicht; Contra: ein ungenutzter Artikel bleibt stehen · B: den Artikel per `delete_article` mitlöschen — Contra: zwei Aufrufe, kann halb scheitern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | A                                                                          | OFFEN, Annahme A (plan.md, T3)  |

## Rückverfolgbarkeit

| REQ     | AC                | Task (plan.md) | Test |
| ------- | ----------------- | -------------- | ---- |
| REQ-001 | AC-001 bis AC-007 | —              | —    |
| REQ-002 | AC-008 bis AC-010 | —              | —    |
| REQ-003 | AC-011 bis AC-013 | —              | —    |
| REQ-004 | AC-014 bis AC-020 | —              | —    |
| REQ-005 | AC-021 bis AC-027 | —              | —    |
| REQ-006 | AC-028 bis AC-035 | —              | —    |
| REQ-007 | AC-036 bis AC-041 | —              | —    |
| REQ-008 | AC-042 bis AC-045 | —              | —    |
| REQ-009 | AC-046 bis AC-050 | —              | —    |
| REQ-010 | AC-051 bis AC-056 | —              | —    |
