---
status: freigegeben
datum: 2026-11-22
---

# 0025 — Einkauf: Liste, Einkaufen, Artikel und Märkte

**Quelle:** ER-08, ER-30, ER-31; L-01, L-02, L-04, L-06–L-13, S-01–S-03, M-01–M-05 (L-05 ersetzt
durch ER-30; L-03 ist Spec 0021).

**Kritischer Pfad:** ja — Laden-Warteschlange (abhaken mit Merkmal, hinzufügen mit Bremse
offline), neue/geänderte Listen-RPCs, neue Eindeutigkeit in `shopping_items`, Löschen von Daten
(Herkunft entfernen, Artikel samt Erledigtem löschen).

## Ziel

„+ Aus Kalender“ zeigt sieben Tage ab heute, nach Kalenderwoche gruppiert. Jede Menge auf der Liste
ist änderbar, jede Herkunft einzeln entfernbar, der Vorratscheck rundet kaufbar und lässt Mengen
anpassen. „Was fehlt?“ und „Posten hinzufügen“ im Laden sind dieselbe Eingabe mit einer Suche, die
Wortteile in beliebiger Reihenfolge findet. Im Laden lässt sich jeder Posten umsortieren, der
Fortschritt zählt nur diesen Einkauf; Artikel lassen sich gezielt aufräumen.

## Nicht-Ziele

- Kalender → Liste nach dem Übernehmen (Portionen ändern, „Zutaten auch von der Liste nehmen?“):
  L-03, Spec 0021. „aktualisieren“ in „Aus Kalender“ entfällt (Entscheidung 14).
- Keine neue Offline-Aktion: „Erledigt“ auf der Liste ist die Laden-Aktion „abhaken“ (ADR-0008
  Nachtrag); alles andere bleibt online.
- Keine Dauerposten (die nie gebaute Herkunft `recurring` entfällt), keine Bestände mit Mengen.
- Keine Adress-Parameter (Spec 0019: „steht nach Spec 0019 in der Adresse“), keine neuen Einheiten
  (Spec 0023, E-09).

## Schon erledigt

- S-03 Teil 2: Ein nur erledigter Artikel wird beim Hinzufügen wieder geöffnet
  (`add_shopping_contributions` Schritt 3, `supabase/migrations/20261121062356_shopping_rpcs.sql`;
  core `addContribution`). Der Doppelposten im Review stammt aus `packages/api/src/seed/demo.ts`.
- S-01 offline: Hinzufügen im Laden geht offline über die Warteschlange (`queueAdd`,
  `packages/api/src/commands-shopping.ts`); es fehlen nur Vorschläge und Bremse.
- L-13 teilweise: „Suchen oder anlegen“ findet „Milchko“ → „Kokosmilch“ schon
  (`packages/core/src/search-or-create.ts`); „Was fehlt?“ nutzt eine zweite Suche ohne Wortteile
  (`searchArticles`, `packages/core/src/articles.ts`).
- Listen-Tabelle: `shopping_lists` (mit `is_default`, `store_id`) gibt es seit ADR-0012 nicht mehr;
  Posten gehören direkt zum Haushalt (`20261121062354_shopping.sql`, pgTAP `apply_changes.test.sql`).

## Anforderungen

Beispiele: heute ist **So 22.11.2026** (KW 47: 16.–22.11., KW 48: 23.–29.11., KW 49: 30.11.–6.12.).
Haushalt „Enrico & Nadja“, Standardmarkt „Rewe Südstadt“, Markt „dm“ mit 14 ausgeblendeten
Bereichen. Handy 390 px, Desktop 1440 px.

### Liste

**REQ-001 — „+ Aus Kalender“: sieben Tage ab heute.** Das Fenster „Was soll auf die Liste?“ zeigt
sieben Tage, nie vor heute, gruppiert nach KW; ‹ › blättert um sieben Tage, ‹ endet bei heute;
vorausgewählt ist, was in den sieben Tagen der Startseite geplant ist und noch nicht auf der Liste
steht. Quelle: ER-30. Offline: lesend; Übernehmen braucht Netz (wie Spec 0006).
Plan: Fr 20.11. „Lasagne“; So 22.11. „Shakshuka“; Mo 23.11. „Lasagne“; Mi 25.11. „Mango-Curry“ (steht
schon auf der Liste); Fr 27.11. „Trattoria Da Enzo“; Sa 28.11. „Grillabend“ und „Eislaufen“; Di
1.12. „Shakshuka“; vorgemerkt „Linsen-Dal“. Kopf „‹ 22.–28. Nov ›“, Gruppen „KW 47 · 22. Nov“,
„KW 48 · 23.–28. Nov“ (gezeigte Tage der Woche, Datumsformat wie `dateRangeLabel`).

- AC-001: Angenommen der Plan · Wenn ich auf „Liste“ „+ Aus Kalender …“ wähle · Dann Kopf „22.–28.
  Nov“, ‹ ausgegraut, Gruppen „KW 47 · 22. Nov“ (So 22 · heute: Shakshuka) und „KW 48 · 23.–28. Nov“
  (Lasagne, Mango-Curry „steht schon auf der Liste“, „Grillabend (2 Rezepte)“); ausgewählt
  Shakshuka, Lasagne, Grillabend; Fr 20.11., „vorbei“, Restaurant und Aktivität fehlen; Knopf
  „Weiter: 3 Gerichte“.
- AC-002: Wenn › · Dann Kopf „29. Nov – 5. Dez“, Gruppe „KW 49 · 30. Nov – 5. Dez“ mit „Shakshuka“
  (Di 1) nicht ausgewählt · Wenn ich sie wähle und ‹ · Dann „22.–28. Nov“ mit unveränderter Auswahl,
  Knopf „Weiter: 4 Gerichte“, ‹ ausgegraut.
- AC-003: Angenommen im Kalender ist KW 49 angezeigt · Wenn „Auf die Einkaufsliste“ · Dann Kopf
  „30. Nov – 6. Dez“, Shakshuka (Di 1) ausgewählt · Wenn ‹ · Dann „23.–29. Nov“ ohne Auswahl · Wenn ‹
  · Dann „22.–28. Nov“, ‹ ausgegraut.
- AC-004 (Rand): Angenommen im Kalender ist KW 46 oder KW 47 angezeigt · Wenn „Auf die
  Einkaufsliste“ · Dann öffnet das Fenster wie AC-001.
- AC-005 (Rand): Angenommen heute ist So 27.12.2026 · Dann Kopf „27. Dez – 2. Jan“, Gruppen „KW 52 · 27. Dez“ und „KW 53 · 28. Dez – 2. Jan“.
- AC-006 (Rand): Angenommen vom 22. bis 28.11. ist kein Rezept geplant · Dann steht „In diesen
  sieben Tagen ist kein Rezept geplant.“, „Vorgemerkt“ bleibt, „Weiter“ ist ausgegraut mit „Wähle
  mindestens ein Gericht“.

**REQ-002 — Eingabezeile ohne Kacheln, mit Plus.** Unter „Was fehlt?“ stehen keine Kacheln
häufiger Artikel mehr; rechts steht ein Plus „Hinzufügen“ statt „Senden“; beim Tippen bleiben
Vorschau und passende Artikel. Quelle: ER-31. Offline: vollständig (Laden-Aktion hinzufügen).

- AC-007: Angenommen das Feld ist leer · Dann keine Kachel („Milch“, „Brot“ …), rechts ein Plus
  „Hinzufügen“ · Wenn ich „2 Käse (Gouda)“ tippe · Dann „Menge 2×“, „Artikel Käse“, „Zusatz Gouda“
  und passende Artikel · Wenn Plus · Dann „Käse (Gouda) 2×“ auf der Liste, Feld leer mit Fokus.
- AC-008 (Rand): Angenommen das Feld ist leer oder nur Leerzeichen · Dann ist das Plus ausgegraut
  und Enter fügt nichts hinzu.

**REQ-003 — Jede Menge änderbar, Herkunft einzeln entfernbar.** In „Posten bearbeiten“: reine
Anzahlen behalten „− n× +“; sonst ersetzt das Feld „Von Hand“ beim „Fertig“ alle eigenen Beiträge
durch einen (leer = keiner); jede Herkunft aus Rezepten hat ein ✕ (sofort, 5 s „Rückgängig“); ohne
Beitrag ist der Posten entfernt. „Menge“ zeigt die Summe. Quelle: L-01. Offline: nur online, Feld und ✕ ausgegraut;
„+“ geht offline wie auf der Zeile (Spec 0019 REQ-010), „−“ nicht.

- AC-009: Angenommen „Bier“ mit „von Hand: 2 Kasten“ · Wenn ich „Von Hand“ auf „1 Kasten“ setze und
  „Fertig“ · Dann „Bier 1 Kasten“, auch bei Nadja.
- AC-010: Angenommen „Möhren“ mit „Lasagne (Mo): 1× · von Hand: 500 g“ · Dann zeigt das Fenster
  „Menge 1× · 500 g“, „Von Hand 500 g“, Herkunft „Lasagne (Mo) 1× ✕“ · Wenn „Von Hand“ = „1 kg“ und
  „Fertig“ · Dann „Möhren 1× · 1 kg“ · Wenn ✕ bei „Lasagne (Mo)“ · Dann „Möhren 1 kg“ und Hinweis
  „Lasagne (Mo) entfernt“ mit „Rückgängig“.
- AC-011 (Rand): Angenommen „Reibekäse“ nur mit „Lasagne (Mo): 75 g“ · Wenn ✕ · Dann Fenster zu,
  Posten weg, „Reibekäse entfernt“ mit „Rückgängig“, das ihn an derselben Stelle zurückholt.
- AC-012 (Fehler): Wenn „Von Hand“ = „viel“ · Dann „Menge nicht erkannt – z. B. 500 g oder 2“ und
  „Fertig“ ausgegraut.
- AC-013 (Konflikt): Angenommen Nadja hat „Möhren“ entfernt, Enrico hat das Fenster offen · Wenn ✕ ·
  Dann schließt es mit „Möhren steht nicht mehr auf der Liste“, ohne Fehlermeldung.

**REQ-004 — Artikel aus dem Posten, Zusatz nicht still überschreiben.** „Posten bearbeiten“ hat
„Artikel bearbeiten ›“ (Fenster aus Spec 0007, danach zurück); ändert man den Zusatz, nennt das
Fenster jeden Rezept-Zusatz, der ersetzt wird. Quelle: L-02, L-11. Offline: Artikel lesend,
Zusatz nur online.

- AC-014: Angenommen „Möhren“ offen · Wenn „Artikel bearbeiten ›“, Name „Karotten“, „Fertig“ · Dann
  zurück in „Posten bearbeiten“ mit Titel „Karotten“, Liste und Nadja zeigen „Karotten“.
- AC-015: Angenommen „Mozzarella“ mit „Lasagne (Mo): 1×“ (Zusatz „Fior di Latte“) und „von Hand:
  1×“ · Wenn ich den Zusatz in „Büffel“ ändere · Dann darunter „Ersetzt den Zusatz „Fior di Latte“
  aus Lasagne (Mo)“ · Wenn „Fertig“ · Dann „Mozzarella (Büffel)“.
- AC-016 (Rand): Wenn ich den Zusatz leere · Dann „Entfernt den Zusatz „Fior di Latte“ aus Lasagne
  (Mo)“; ohne Rezept-Zusatz erscheint kein solcher Hinweis.

**REQ-005 — Klare Zahlen, Rückgängig an derselben Stelle.** Die Kopfzeile nennt offene Posten und
die Zahl der Gerichte (Rezept oder Sammlung); „Liste leeren“ nennt offen und erledigt getrennt;
jedes Rückgängig eines Entfernens stellt die frühere Reihenfolge wieder her. Quelle: L-06, L-07,
L-08. Offline: Kopfzeile lesend, Rest online.

- AC-017: Angenommen 14 offen aus „Lasagne“, „Mango-Curry“, „Shakshuka“, „Grillabend“ · Dann
  „14 offen · aus 4 Gerichten ›“ · Wenn antippen · Dann kleines Fenster „Aus diesen Gerichten“ mit
  „Grillabend · 6 Posten“, „Lasagne · 5 Posten“ … in der Reihenfolge des Hinzufügens.
- AC-018 (Rand): 3 offen nur aus „Lasagne“ → „3 offen · aus 1 Gericht ›“; nur „von Hand“ → „3 offen“,
  nicht antippbar.
- AC-019: Angenommen 14 offene, 3 erledigte · Wenn ⋯ → „Liste leeren …“ · Dann „14 offene und 3
  erledigte Posten werden entfernt, auch die aus dem Kalender.“; bei 1 offenem, 0 erledigten
  „1 offener Posten wird entfernt, auch wenn er aus dem Kalender kommt.“
- AC-020: Angenommen „Zahnpasta“ vor „Duschgel“ unter „Drogerie“ · Wenn − auf 1× (oder Wischen
  links) und „Rückgängig“ · Dann „Zahnpasta“ wieder vor „Duschgel“, auch bei Nadja und nach Neuladen.
- AC-021 (Rand): Rückgängig nach „Liste leeren“ stellt alle Posten in ihrer früheren Reihenfolge her.

**REQ-006 — Auf der Liste als erledigt markieren.** Handy: nach rechts wischen; überall: „Als
erledigt markieren“ in „Posten bearbeiten“. Das ist die Laden-Aktion „abhaken“; sie löst kein
„… kauft gerade ein“ aus. Quelle: L-12 (ändert D24, Spec 0006). Offline: vollständig über die
Warteschlange, „Abhaken gewinnt“.

- AC-022: Angenommen Handy, „Milch 1×“ offen · Wenn nach rechts wischen · Dann „Milch“ unter
  „Erledigt“, auch bei Nadja, Hinweis „Milch erledigt“ mit „Rückgängig“; links wischen entfernt weiter.
- AC-023: Angenommen Desktop · Wenn „Milch“ öffnen, „Als erledigt markieren“ · Dann Fenster zu,
  „Milch“ unter „Erledigt“.
- AC-024 (offline): Angenommen offline · Wenn wischen · Dann sofort unter „Erledigt“ mit
  „wird synchronisiert“, mit Netz auch bei Nadja.
- AC-025 (Konflikt): Angenommen Nadja hat „Liste“ offen · Wenn Enrico zuhause „Milch“ erledigt ·
  Dann sieht Nadja kein „Enrico kauft gerade ein“; hat Nadja „Milch“ vorher entfernt, verschwindet
  sie nach Enricos Sync überall ohne Fehlermeldung.

### Vorratscheck

**REQ-007 — Vorrat offen, Mengen anpassbar, Bestand sichtbar.** „Vorrat & Gewürze (n)“ startet
aufgeklappt (Zeilen weiter abgewählt); die Menge jeder Zeile ist antippbar (Anzahl: − n× +, sonst
Textfeld); unter einer Zeile steht „schon auf der Liste: 1×“, wenn der Artikel offen auf der Liste
steht. Quelle: ER-08, L-04. Offline: nur online (Übernehmen).

- AC-026: Angenommen „Mango-Curry“ mit „Reis“, „Kreuzkümmel“ (Vorrat) · Wenn Vorratscheck öffnet ·
  Dann „Vorrat & Gewürze (2)“ aufgeklappt, „Reis“, „Kreuzkümmel“ blass und abgewählt sichtbar.
- AC-027: Angenommen „Zwiebeln 1× von Hand“ auf der Liste, „Lasagne (Mo)“ braucht 2× · Dann Zeile
  „Zwiebeln 2×“ mit „Lasagne (Mo) · schon auf der Liste: 1×“ · Wenn − · Dann „1×“; übernehmen →
  Liste „Zwiebeln 2×“.
- AC-028: Angenommen „Rucola 60 g“ aus „Lasagne (Mo)“ · Wenn Menge antippen, „1 Packung“ · Dann Zeile
  „1 Packung“; übernehmen → „Rucola 1 Packung“, Herkunft „Lasagne (Mo): 1 Packung“.
- AC-029 (Fehler): Wenn „viel“ eingetragen · Dann „Menge nicht erkannt – z. B. 500 g oder 2“, die
  Zeile behält „60 g“; − bei 1× bleibt 1× (abwählen statt 0).

**REQ-008 — Kaufbar runden.** Umgerechnete Rezeptmengen auf Liste und im Vorratscheck werden je
Einheit aufgerundet (Regel in core); Werte mit Faktor 1 bleiben wie im Rezept; die Rezeptansicht
bleibt genau. Quelle: L-04 (ersetzt Rundungsregel Spec 0009, REQ-005). Offline: — (reine Regel).
Regel: g/ml unter 250 → 10er, 250–999 → 50er, ab 1000 → 100er (als kg/l); kg/l → 0,1; zählbare
Einheiten und ohne Einheit → ganze Zahl; EL/TL → ½; Prise, Msp., Handvoll unverändert; sonstige →
zwei Nachkommastellen.

- AC-030: „57 g“ wird „60 g“, „112,5 g“ → „120 g“, „438 g“ → „450 g“, „1 125 g“ → „1,2 kg“,
  „0,75 Glas“ → „1 Glas“, „1,33 EL“ → „1,5 EL“, „1 Prise“ bleibt.
- AC-031 (Rand): Angenommen „Lasagne“ (4 Portionen) mit „75 g Reibekäse“ für 4 Portionen geplant ·
  Dann „Reibekäse 75 g“ (Faktor 1); für 8 Portionen „150 g“.

### Eingabe, Suche, Bereiche

**REQ-009 — Artikel finden.** Eine Suchregel in core für „Was fehlt?“, „Posten hinzufügen“,
„Artikel“, Zutat und Bereichswähler: Anfang, Teilwort, Tippfehler, Synonym wie bisher; dazu (a) alle
Wörter in beliebiger Reihenfolge, je als Teil des Namens (Rang wie Teilwort); (b) Wortteil ab 5
Buchstaben (Rang zuletzt, bremst nie). Ein exakt getippter Name samt Klammer oder Komma geht vor der
Klammer-Regel. Quelle: L-10, L-13. Offline: vollständig (lokaler Katalog).

- AC-032: „Milchko“ findet „Kokosmilch“; „tomaten passiert“ findet „Passierte Tomaten“; „bio ei“
  findet „Bio-Eier“; „Saftapfel“ findet „Apfelsaft“.
- AC-033 (Nicht-Beispiele): „Brotko“ findet „Kokosbrot“ nicht (gemeinsamer Teil nur 4 Buchstaben);
  „ei bio“ findet „Eisbein“ nicht; „Milchko“ bremst nicht mit „Meinst du Kokosmilch?“.
- AC-034: Angenommen es gibt den Artikel „Mozzarella (Fior di Latte)“ · Wenn ich „2 Mozzarella (Fior
  di Latte)“ eingebe · Dann 2× dieser Artikel ohne Zusatz.
- AC-035 (Rand): Angenommen es gibt nur „Mozzarella“ · Wenn „Mozzarella (Büffel)“ · Dann Artikel
  „Mozzarella“ mit Zusatz „Büffel“.

**REQ-010 — Ein Bereichswähler.** „Posten bearbeiten“, „Artikel bearbeiten“ und „Liegt woanders …“
nutzen denselben Wähler: Suchfeld „Bereich suchen oder anlegen“, oben „Ohne Bereich“, alle Bereiche
in der Reihenfolge ohne Markt, der aktuelle mit ✓, „„Deko“ neu anlegen“ beim Tippen. Quelle: L-09.
Offline: zuordnen vollständig (Laden-Aktion), neu anlegen nur online.

- AC-036: Angenommen „Geschenkpapier“ liegt in „Haushalt & Reinigung“ · Wenn Wähler öffnen · Dann
  ✓ bei „Haushalt & Reinigung“, „Ohne Bereich“ oben · Wenn „Ohne Bereich“ · Dann steht es unter
  „Ohne Bereich“, auch in „Einkaufen“.
- AC-037 (offline): Wenn offline „Deko“ tippe · Dann „„Deko“ neu anlegen“ ausgegraut mit
  Offline-Hinweis; vorhandene Bereiche wählbar.

### Einkaufen

**REQ-011 — „Liegt woanders …“ an jedem Posten.** Jeder offene Posten in „Einkaufen“ hat ⋯ mit
„Liegt woanders …“; es öffnet den Bereichswähler „Wo liegt Ingwer?“; die Zuordnung gilt künftig
überall. „Bereich zuordnen“ unter „Ohne Bereich“ öffnet denselben Wähler. Quelle: S-02. Offline:
vollständig.

- AC-038: Angenommen „Ingwer“ unter „Obst & Gemüse“ bei „Rewe Südstadt“ · Wenn ⋯ → „Liegt woanders
  …“ → „Gewürze“ · Dann „Ingwer“ unter „Gewürze“, Hinweis „Ingwer liegt jetzt unter Gewürze“, auch
  auf „Liste“ und bei Nadja.
- AC-039 (Rand): Angenommen „Gewürze“ ist bei „dm“ ausgeblendet, Markt „dm“ gewählt · Wenn „Ingwer“ →
  „Gewürze“ · Dann steht „Ingwer“ unter „Woanders kaufen“.

**REQ-012 — „Posten hinzufügen“ = „Was fehlt?“.** Das Feld in „Einkaufen“ ist dieselbe Eingabe wie
auf der Liste (Vorschau, passende Artikel, Bremse „Meinst du …?“, REQ-009), ohne Mikrofon und
Assistent. Quelle: S-01. Offline: vollständig; Bremse und Treffer kommen aus dem lokalen Katalog,
der Eintrag geht wie heute in die Warteschlange.

- AC-040: Angenommen offline in „Einkaufen“ · Wenn „Zwiebelm“ und Enter · Dann „Meinst du Zwiebeln?“
  mit „Ja“/„Trotzdem neu“ · Wenn „Ja“ · Dann „Zwiebeln“ steht sofort (wird synchronisiert), kein
  Artikel „Zwiebelm“; mit Netz bei allen.
- AC-041 (Fehler): Angenommen online, der Server lehnt ab · Dann verschwindet der Posten und
  „Hat nicht geklappt – bitte noch einmal versuchen“.

**REQ-013 — Fortschritt dieses Einkaufsgangs, ein Posten je Artikel.** Ein Einkaufsgang beginnt
mit dem Öffnen von „Einkaufen“ (übersteht Neuladen) und endet mit „Fertig“ oder Verlassen;
Fortschritt und „Im Wagen“ zählen nur, was beim Start offen war oder unterwegs dazukam. Ein Artikel
hat höchstens einen Posten; kommt ein erledigter wieder dazu, ist er offen mit der neuen Menge.
Quelle: S-03. Offline: vollständig.

- AC-042: Angenommen 15 offen, „Brot“, „Butter“ erledigt vom letzten Mal · Wenn „Einkaufen“ · Dann
  „0/15“, „Im Wagen“ leer · Wenn 3 abhaken · Dann „3/15“ · Wenn „Butter“ hinzufügen · Dann „Butter“
  offen, „3/16“, „Butter“ nirgends erledigt.
- AC-043: Wenn „Fertig“ (online) · Dann alle erledigten Posten weg (auch „Brot“), Hinweis
  „3 gekauft · 13 bleiben“.
- AC-044 (Rand): Angenommen „Limetten“ im Wagen · Wenn Haken raus · Dann wieder offen, „2/16“; nach
  Neuladen bleibt die Zählung, nach Verlassen und Öffnen beginnt sie neu.

### Artikel und Märkte

**REQ-014 — Artikel aufräumen.** Auf „Bereiche“ öffnet jede Bereichszeile „Artikel“ mit diesem
Bereich als Filter; „Artikel“ bekommt „Bereich ▾“ und „Unbenutzt (n)“ (in keinem Rezept und nicht
offen auf der Liste); „Löschen“ sperrt nur ein offener Posten, Erledigtes geht mit. Quelle: M-01,
M-02, M-03. Offline: lesend, Löschen online.

- AC-045: Wenn „Obst & Gemüse · 85 Artikel ›“ · Dann „Artikel“ mit Filter „Bereich: Obst & Gemüse ✕“
  und 85 Zeilen.
- AC-046: Angenommen „Zwiebelm“ ohne Rezept und nicht auf der Liste · Dann steht es unter
  „Unbenutzt (1)“.
- AC-047: Angenommen „Brot“ nur erledigt auf der Liste · Wenn „Löschen“ · Dann Artikel und erledigter
  Posten weg; „Rückgängig“ holt den Artikel zurück, den erledigten Posten nicht.
- AC-048 (Fehler): Angenommen „Milch“ offen auf der Liste · Dann „Löschen“ ausgegraut mit „Steht offen
  auf der Einkaufsliste“; fremder Haushalt/abgemeldet → `delete_article` lehnt ab.

**REQ-015 — Bereiche und Märkte sichtbar einfügen.** Ein neuer Bereich nennt, wo er in den Märkten
landet; ein neuer Markt kann Reihenfolge und ausgeblendete Bereiche eines anderen übernehmen.
Quelle: M-04, M-05. Offline: nur online.

- AC-049: Angenommen „Rewe Südstadt“ und „dm“ · Wenn neuer Bereich „Backzutaten“ (irgendwo) · Dann
  Hinweis „Backzutaten steht in jedem Markt am Ende“ mit „Märkte ›“; ohne Markt nur „„Backzutaten“
  angelegt“.
- AC-050: Wenn „+ Neuer Markt“, „Rossmann“, „Reihenfolge übernehmen von …“ → „dm“ · Dann gleiche
  Laufreihenfolge und dieselben 14 Bereiche ausgeblendet; spätere Änderungen an „dm“ wirken nicht.
- AC-051 (Rand): ohne Auswahl gilt „Wie die Bereiche“ (Reihenfolge ohne Markt, nichts ausgeblendet,
  Spec 0007, AC-043).

## Entscheidungen

Alle nach Enricos Regel „Empfehlung nehmen“ (Claude, 22.11.2026).

1. ER-31 „Vorschläge“ = die festen Kacheln häufiger Artikel; die Treffer beim Tippen bleiben, weil
   S-01 sie im Laden verlangt und sie Tippfehler-Artikel verhindern. Ersetzt UI-Konzept v2, 4.7.
2. ER-30: Seiten beginnen bei einem beliebigen Tag ≥ heute; vom Kalender aus beim Montag der
   angezeigten Woche, sonst heute; Gruppenkopf nennt nur die gezeigten Tage. Ersetzt Spec 0006,
   AC-049–AC-051, AC-054.
3. L-01 nach Empfehlung: Feld „Von Hand“ + ✕ je Herkunft (statt „Menge überschreiben“). Ersetzt
   Spec 0006, AC-020 (Inhalt des Fensters).
4. L-04: Eine geänderte Zeilenmenge trägt der erste Beitrag der Zeile; weitere Beiträge behalten
   ihre Herkunft ohne Menge, damit „steht schon auf der Liste“ je Eintrag stimmt.
5. L-11: Annahme A aus Spec 0006 (Zusatz gilt für den Posten) bestätigt, aber mit sichtbarem
   Hinweis. Ändert Spec 0006, AC-021.
6. L-12: Wischen rechts = erledigt (Empfehlung); dafür Merkmal „auf der Liste abgehakt“, damit
   „kauft gerade ein“ stimmt. Ändert Spec 0006 Nicht-Ziel D24.
7. L-07: „aus 4 Gerichten“ statt „Rezepten“, weil Sammlungen mitzählen (wie „Weiter: 3 Gerichte“).
8. L-04 Rundung: Stufen 10/50/100 g bzw. ml, Faktor 1 unverändert (sonst würde „75 g“ zu „80 g“).
9. S-03: ein Posten je Artikel als Regel der Datenbank; Einkaufsgang endet beim Verlassen (einfach,
   ohne Zeitgrenze). Ändert Spec 0006, AC-047 (Zählung im Hinweis).
10. M-02: Erledigtes ignorieren (Empfehlung), offener Posten sperrt weiter. Ändert Spec 0007,
    AC-033/AC-034. M-04: Hinweis statt ausgeblendet anlegen; ergänzt Spec 0007, AC-048 und
    OFFEN 6g.
11. ER-08: Vorrat ausgeklappt; ändert Spec 0006, AC-055/AC-056, Spec 0009, AC-025.
12. Laufreihenfolge bleibt Feld (`area_order`, `hidden_area_ids`): eine Reihenfolge = ein Schreibvorgang
    mit „letzte Änderung gewinnt“; eine Tabelle je Markt und Bereich brächte nur mehr Zeilen.
13. Glossar (für den Hauptlauf): neu „Einkaufsgang“ (`ShoppingRun`, nicht `ShoppingTrip`: `trip`
    heißt nach Spec 0022 nur die Reise); „Vorratscheck“ (Vorrat
    ausgeklappt), „Herkunft“ (ohne `recurring`), „Dauerposten“ (nicht gebaut) anpassen.
14. Abgestimmt mit Spec 0021, 22.11.2026: L-03 „aktualisieren“ bei „steht schon auf der Liste“
    entfällt — beide Specs schoben es einander zu; seit 0021 REQ-007 folgt die Liste den Portionen
    selbst, Entfernen fragt (0021 REQ-015), Verschieben behält die Beiträge.
15. Abgestimmt mit Spec 0019, 22.11.2026: Wischen „erledigt“ und „+“ auf der Liste sowie der
    Bereichswähler in „Posten bearbeiten“ und „Artikel bearbeiten“ (REQ-010) sind die Laden-Aktionen
    „abhaken“, „Posten hinzufügen“ und „Bereich zuordnen“ außerhalb des Einkaufsmodus. Der Nachtrag zu
    ADR-0008 nennt bisher nur den Einkaufsmodus; diese Spec ergänzt einen Nachtrag „gilt auch auf
    Liste und Artikel“ (Aktionen und Konfliktregeln unverändert, „ein Posten je Artikel“ jetzt auch für
    erledigte Posten).
16. Beim Bau (Claude, 22.11.2026): `restore_cleared_items` und `merge_articles` bei einem schon
    vorhandenen Posten desselben Artikels — ein offener Eintrag tritt bei (ein erledigter Posten
    wird dabei wieder offen, wie beim Hinzufügen), ein erledigter Eintrag kommt nicht zurück (der
    Posten von heute gewinnt).
17. Beim Bau: `set_manual_amount(item, count, qty, unit)` nimmt Anzahl oder Menge, nicht beides;
    der früheste Beitrag „von Hand“ behält Kennung, Platz und Zusatz.
    `create_store(household, id, name, copy_from)` nimmt eine Client-ID wie die anderen Schreibwege.
18. Beim Bau: `created_at` beim Wiederherstellen bleibt über `set_timestamps`, das ein früheres
    `created_at` nur während einer Wiederherstellung (Transaktions-Einstellung) und nie für die
    API-Rollen übernimmt.
19. Beim Bau: Der Einkaufsgang liegt im Sitzungsspeicher des Tabs (nur Posten-Kennungen); Neuladen
    behält ihn, Verlassen von „Einkaufen“ löscht ihn. „Fertig“ räumt alle erledigten Posten ab,
    sobald es welche gibt.
20. Beim Bau: `create_store` ohne Vorlage legt die Bereiche in ihrer Reihenfolge an, nichts
    ausgeblendet (wie bisher, Spec 0007 AC-043); „Ohne Bereich“ im Wähler ist auch offline
    wählbar (Laden-Aktion).

## Daten

- `shopping_items`: eindeutig `(household_id, article_id)` statt nur offen; `checked_on_list boolean
not null default false` (gesetzt von `set_shopping_item_checked(…, p_on_list)`, die Warteschlange
  trägt `onList`); `activeShopper` ignoriert solche Haken.
- RPCs: `set_manual_amount(item, count|qty+unit)`, `remove_item_contributions(item, ids)` (gibt
  Posten für `restore_cleared_items` zurück); `restore_cleared_items` behält `created_at` (≤ now());
  Entfernen läuft über dieselbe Rückgabe; `delete_article` löscht erledigte Posten mit;
  `create_store(name, copy_from)`.
- Trigger nach Löschen eines Bereichs entfernt seine Kennung aus `stores.area_order` und
  `hidden_area_ids`.
- Entfällt: Herkunft `recurring` (Check in `shopping_contributions.source`, core `isRecurring`,
  „Dauerposten“ in `originLabel`, Seed „Bananen“); Zweig „Haken raus bei zweitem offenem Posten“ in
  `set_shopping_item_checked`; core `searchArticles`; Kacheln `QUICK_ADD`; `AreaSheet` und
  `AreaPicker` (durch einen Wähler ersetzt); Schritt „mehrere Posten eines Artikels“ in
  `merge_articles` (führt Posten zusammen).

## Risiken

| Risiko                                           | Gegenmaßnahme                                              | Test                                                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Fremder Haushalt ändert Menge/Herkunft/Artikel   | RPCs prüfen Mitgliedschaft (`not_member`), RLS             | pgTAP `einkauf_rpcs.test.sql` (Ben und anon je neuer RPC)                                                                   |
| Warteschlange mit altem Eintrag (`onList` fehlt) | Schema mit Standardwert, Eintrag nie blockierend           | core `store-queue.test.ts` („stored entry of the older app“), api `backend.test.ts`                                         |
| Eindeutigkeit bricht Rückgängig/Zusammenführen   | restore und merge vereinen in den vorhandenen Posten       | pgTAP `einkauf_rpcs`, `shopping_list_rpcs` (AC-037), `article_rpcs` (AC-036)                                                |
| Ungültige Menge oder Ids                         | Checks wie `shopping_contributions_*`, `invalid_value`     | pgTAP `einkauf_rpcs` (AC-012, leere Ids), core `parseItemAmount`                                                            |
| Artikel löschen nimmt offenen Posten mit         | `article_in_use` bei offenem Posten                        | pgTAP `einkauf_rpcs` (AC-047, AC-048), `article_rpcs`                                                                       |
| Gesendete Änderung scheitert                     | Überlagerung zurück, Hinweis „Hat nicht geklappt …“        | api `commands-einkauf.backend.test.ts` (AC-041)                                                                             |
| `created_at` beim Wiederherstellen erzwungen     | nur Funktionseigentümer bei gesetzter Einstellung, ≤ now() | pgTAP `einkauf_rpcs` (AC-011 „never later than now()“); Security-Check: Hinweis offen (untere Grenze, nur eigener Haushalt) |

## Umsetzung

- [x] 1. core: Seiten und Gruppen „+ Aus Kalender“, Vorauswahl (AC-001–AC-006)
- [x] 2. core: Rundung `buyableQty` (AC-030, AC-031); eine Suche + exakte Namen (AC-032–AC-035)
- [x] 3. core: Kopfzeile, Text „Liste leeren“, Einkaufsgang-Fortschritt, `activeShopper` (AC-017–AC-019, AC-025, AC-042–AC-044)
- [x] 4. supabase (db-change): Eindeutigkeit, `checked_on_list`, neue RPCs, `created_at` beim Wiederherstellen, `delete_article`, `create_store`, Bereichs-Trigger, `recurring` weg; pgTAP (AC-009–AC-013, AC-020–AC-025, AC-042, AC-047, AC-048, AC-050)
- [x] 5. api: Befehle und Warteschlange `onList` (AC-009–AC-013, AC-022–AC-024, AC-040, AC-041)
- [x] 6. app Liste: Eingabezeile, Posten-Fenster, Wischen rechts (AC-007–AC-016, AC-020–AC-023)
- [x] 7. app Vorratscheck (AC-026–AC-029); Bereichswähler + „Liegt woanders …“ (AC-036–AC-039)
- [x] 8. app Einkaufen: Eingabe, Fortschritt (AC-040–AC-044); Artikel/Märkte (AC-045–AC-051)
- [x] 9. Aufräumen: Seed ohne Doppelposten und `recurring`, tote Exporte; `/security-check`
- [x] 10. Nachtrag zu ADR-0008: Laden-Aktionen auch auf der Liste, ein Posten je Artikel
      (Entscheidung 15)
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` und `pnpm exec supabase test db`

## Nachweis

Stand 22.11.2026, Branch `feat/0025-einkauf`:

- `pnpm format:check && pnpm check`: grün (core 1313, api 879 Tests).
- `pnpm exec supabase test db` nach `pnpm db:reset`: PASS (neu `einkauf_rpcs.test.sql`, 67 Tests;
  angepasst `shopping_tables`, `store_rpcs`, `article_rpcs`, `shopping_list_rpcs`, `schema_lint`).
- `pnpm build:web`: grün. e2e (`rundgang-einkauf.spec.ts` neu, `rundgang-liste.spec.ts` angepasst):
  nur typgeprüft, läuft in Spec 0028.
- Security-Check (Migration und Befehle): 0 kritisch/hoch/mittel/niedrig, 2 Hinweise;
  Rollenprüfung in `set_timestamps` auf den Eigentümer umgestellt, untere Grenze für
  `created_at` offen (wirkt nur im eigenen Haushalt).
- Glossar (Entscheidung 13) bleibt für den Hauptlauf.
