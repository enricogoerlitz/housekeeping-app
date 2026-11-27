---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0050 — Zutaten einfügen: Vorschläge beim Tippen und Vorschau

**Quelle:** Enricos Rückmeldung zur Vorschau vom 26.11.2026 (Batch 3): „Rezept neu hinzufügen, bei
Zutaten hinzufügen, diesem Freitextfeld brauche ich trotzdem irgendwie Vorschläge, damit ich einfach
bestehende Artikel auch wiederverwende!“ Konzept vom Koordinator freigegeben. Betrifft das Feld
„Zutaten einfügen“ im Fenster „Neu“ (Spec 0037, REQ-002) und das Fenster „Zutaten einfügen“ im
Bearbeitungsmodus (Spec 0008, E9). **Kritischer Pfad:** nein (keine Daten-, Sync- oder
Rechteänderung).

## Ziel

Tippe ich Zutaten Zeile für Zeile, schlägt mir die App passende Artikel unseres Haushalts vor, und
ein Tipp übernimmt den Artikel, ohne Menge und Einheit zu verlieren. Unter dem Feld sehe ich, was
aus jeder Zeile wird — bestehender Artikel oder neu — und kann eine Zeile einem anderen Artikel
zuordnen, bevor gespeichert wird. So entstehen keine doppelten Artikel aus Versehen.

## Nicht-Ziele

- Kein neuer Weg zum Speichern: Zeilen ohne Artikel kommen wie bisher orange in den
  Bearbeitungsmodus (Spec 0018, E-01), sofern ich nicht in der Vorschau einen wähle.
- Keine Vorschläge aus dem Starter-Katalog in der Chip-Leiste (nur Artikel des Haushalts); die
  Auswahl in der Vorschau sucht wie „Suchen oder anlegen“ (mit Starter-Katalog).
- Keine KI, keine Diktierfunktion, keine Mengen-Vorschläge.
- Keine Änderung an der Tastatur- und Fensterlage (Spec 0044).

## Anforderungen

Haushalt mit den Artikeln „Zwiebel“ (in 3 Rezepten), „Zwiebel rot“ (in 1 Rezept), „Zwetschgen“
(in keinem), „Möhren“, „Mais“ und „Semmelbrösel“; „Paniermehl“ gibt es nicht.

**REQ-001 — Vorschläge beim Tippen.** Steht der Cursor in einer Zeile, deren Artikelwörter mindestens
2 Buchstaben haben, zeigt die App bis zu 5 passende Artikel des Haushalts als Chips: am Handy direkt
unter dem Feld und, wenn das Feld weiter reicht, am unteren Fensterrand über der Tastatur; am Desktop
unter dem Feld. Gefunden wird wie bei „Suchen oder anlegen“ (Anfang, Teil, Umlaute, Tippfehler,
Ein-/Mehrzahl); bei gleicher Güte stehen oft benutzte Artikel vorn. Der Artikel, dessen Name oder
Synonym die Zeile schon genau ist, wird nicht vorgeschlagen. Offline: offline vollständig (liest nur
den Cache).

- AC-001: Angenommen ich tippe „2 Zwi“ · Dann zeigen die Chips „Zwiebel“ vor „Zwiebel rot“, und es
  sind höchstens 5 Chips
- AC-002: Angenommen „Zwetschgen“ steht in 5 Rezepten und „Zwiebel“ in 3 · Wenn ich „Zw“ tippe ·
  Dann steht „Zwetschgen“ vor „Zwiebel“ (gleich gute Treffer, der öfter benutzte zuerst)
- AC-003: Angenommen ich tippe „zwiebeln“ (klein, Mehrzahl) oder „moeh“ · Dann wird „Zwiebel“ bzw.
  „Möhren“ vorgeschlagen
- AC-004: Angenommen die Zeile ist leer, hat nur eine Menge („200 g“) oder nur einen Buchstaben
  („2 Z“) · Dann gibt es keine Chips
- AC-005: Angenommen der Cursor steht in der ersten von zwei Zeilen · Dann gelten die Chips der
  ersten Zeile, nicht der letzten
- AC-006: Angenommen die Zeile heißt genau „Zwiebel“ · Dann ist „Zwiebel“ kein Chip, „Zwiebel rot“
  schon

**REQ-002 — Vorschlag übernehmen.** Ein Tipp auf einen Chip (am Desktop auch Pfeil runter/hoch zum
Markieren und Enter) ersetzt die Artikelwörter der Zeile durch den Namen des Artikels; Menge,
Einheit und Aufzählungszeichen bleiben, wie getippt; der Cursor steht am Ende der Zeile und bleibt im
Feld. Escape blendet die Chips aus, bis weitergetippt wird. Offline: offline vollständig.

- AC-007: Angenommen „2 Zwi“ · Wenn ich den Chip „Zwiebel“ tippe · Dann steht „2 Zwiebel“ in der
  Zeile
- AC-008: Angenommen „200 g Semm“ in der zweiten von drei Zeilen · Wenn ich „Semmelbrösel“ wähle ·
  Dann steht „200 g Semmelbrösel“ dort, die anderen Zeilen bleiben gleich, und der Cursor steht
  dahinter
- AC-009: Angenommen „- 1 kleine Dose Mai“ · Wenn ich „Mais“ wähle · Dann steht
  „- 1 kleine Dose Mais“ in der Zeile
- AC-010: Angenommen Chips am Desktop · Wenn ich Pfeil runter und Enter drücke · Dann ist der erste
  Chip übernommen und keine neue Zeile entstanden; ohne markierten Chip macht Enter eine neue Zeile

**REQ-003 — Vorschau je Zeile.** Unter dem Feld steht jede erkannte Zeile als Eintrag „Menge ·
Artikel“: mit ✓ für einen bestehenden Artikel, „(neu)“ wenn keiner passt, „Meinst du …?“ bei einem
ähnlich geschriebenen. Ein Tipp auf einen Eintrag öffnet darunter „Suchen oder anlegen“ mit dem
Namen der Zeile; die Wahl (bestehender Artikel, Starter-Eintrag oder „neu anlegen“) gilt beim
Speichern für die Zeilen dieses Namens. Ändere ich den Namen der Zeile, gilt die Wahl nicht mehr.
Offline: offline lesend — die Vorschau geht, gespeichert wird wie bisher nur online.

- AC-011: Angenommen „2 Zwiebel“ und „200 g Paniermehl“ · Dann zeigt die Vorschau „2 · Zwiebel ✓“
  und „200 g · Paniermehl (neu)“
- AC-012: Angenommen „200 g Paniermehl“ · Wenn ich in der Vorschau „Semmelbrösel“ wähle und
  „Anlegen“ tippe · Dann hat das neue Rezept die Zutat „Semmelbrösel“ mit „200 g“, und es entsteht
  kein Artikel „Paniermehl“
- AC-013: Angenommen „200 g Paniermehl“ · Wenn ich in der Vorschau „„Paniermehl“ neu anlegen“ wähle
  und speichere · Dann ist „Paniermehl“ als Artikel angelegt, und die Zeile ist nicht orange
- AC-014: Angenommen eine Wahl für „Paniermehl“ · Wenn ich die Zeile zu „Panko“ ändere · Dann zeigt
  die Vorschau „Panko (neu)“, und die Wahl gilt nicht
- AC-015: Angenommen „200 g Paniermehl“ ohne Wahl · Wenn ich speichere · Dann steht die Zeile wie
  bisher orange im Bearbeitungsmodus

## Entscheidungen

1. Ein gemeinsames Feld für beide Stellen („Neu“ und „Zutaten einfügen“ im Bearbeitungsmodus),
   damit beide gleich vorschlagen und speichern.
2. Gefunden wird mit der einen Artikelsuche (`matchSearchOrCreate`, Spec 0025, REQ-009); neu ist
   nur die Rangfolge bei gleicher Güte: Zahl der Rezepte, die den Artikel benutzen. Mindestens 2
   Buchstaben, weil einer fast alle Artikel trifft.
3. „Am Handy über der Tastatur“: Die Chips stehen unter dem Feld und kleben (`position: sticky`) am
   unteren Rand des Fensters, das bei offener Tastatur auf ihr sitzt (Spec 0032). So bleibt
   `overlay.tsx` unverändert (Spec 0044 arbeitet dort).
4. Die Wahl in der Vorschau gilt je Name der Zeile (normalisiert), nicht je Zeilennummer: Zeilen
   verschieben sich beim Tippen, der Name nicht.
5. Ein Chip setzt den Namen des Artikels ein, nicht ein Synonym; die Zeile ist danach sicher
   zugeordnet (Spec 0007, AC-008).
6. Agent, 26.11.: Zeilen „(neu)“ ohne Wahl bleiben orange wie bisher (Nicht-Ziel 1), weil stilles
   Anlegen genau die Dubletten erzeugen würde, die diese Spec verhindern soll.

## Daten

Liest Artikel und Rezepte aus dem Cache. Schreibt nichts Neues: gespeichert wird über
`createRecipeWithIngredients` bzw. `addPastedRows` wie bisher. Keine Schemaänderung, keine
personenbezogenen Daten.

## Umsetzung

- [x] 1. Core: Zeile am Cursor, Artikelwörter, Ersetzen, Vorschläge mit Rangfolge, Wahl je Name
      (Tests zuerst) (AC-001–AC-009, AC-011–AC-015)
- [x] 2. App: gemeinsames Feld mit Chips, Tasten, Vorschau und Auswahl in „Neu“ und „Zutaten
      einfügen“ (AC-001–AC-015)
- [x] 3. Bildschirmfotos Handy 390×844 und Desktop 1440×900 (`tmp/review-0003/0050/`)
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün

**Nachweis (26.11.2026):** Tests rot zuerst (`ingredient-typing.test.ts`: Modul fehlte;
`search-or-create.test.ts`: Rangfolge; `sticky.test.ts`), dann grün; `pnpm format:check && pnpm check
&& pnpm build:web` grün. Auf dem Entwicklungsserver (Port 8096): „2 Zwi“ zeigt fünf Chips, ein Tipp
ergibt „2 Zwiebeln“ mit dem Cursor im Feld; am Desktop Pfeil runter + Enter macht aus „200 g Pani“
„200 g Paniermehl“ ohne neue Zeile; „200 g Panko“ in der Vorschau auf „Paniermehl“ gelegt und
angelegt: das Rezept hat „200 g Paniermehl“, die unbekannte Zeile steht orange im Bearbeitungsmodus
(Testrezept danach gelöscht). Bildschirmfotos: Haupt-Checkout `tmp/review-0003/0050/`. Nur am iPhone
prüfbar: die Chip-Leiste über der offenen Tastatur und dass die Tastatur beim Tipp auf einen Chip
offen bleibt.
