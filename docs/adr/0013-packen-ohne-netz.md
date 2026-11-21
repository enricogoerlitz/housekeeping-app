---
status: angenommen
datum: 2026-11-21
autor: agent
betrifft: [0008, 0011, packages/core/src/store-queue.ts, packages/api, supabase/migrations]
---

# ADR-0013 — Packen ohne Netz

## Status

`angenommen` (Enrico, 21.11.2026) · ergänzt
[ADR-0008](0008-offline-lesen-mit-eigenem-delta-sync.md) (Nachtrag „Offline im Einkaufsmodus“).
Die fachliche Entscheidung D34 hat Enrico am 20.11.2026 freigegeben (UI-Konzept v2, Abschnitt 6).

## Kontext

ADR-0008 erlaubt Schreiben ohne Netz nur für vier Aktionen im Laden. Weitere Offline-Aktionen
brauchen eine Spec und einen eigenen Nachtrag (`.claude/rules/31-sync.md`).

Spec 0012 bringt Packlisten: eine Kopie der Reisetaschen je Abwesenheit, die man abhakt. Gepackt
wird oft dort, wo das Netz fehlt: vor der Rückreise in der Ferienwohnung, im Zelt, im Ausland ohne
Datenvolumen. D34 im UI-Konzept v2 hat entschieden, dass Packen offline geht „wie im Laden“. Dazu
kommen zwei Sammel-Aktionen, die nur den Haken ändern: „Alles einpacken“ (alle offenen Packstücke
einer Tasche) und „Für die Rückreise zurücksetzen“ (alle Haken der Packliste weg). Spec 0012,
Offene Frage 1, nimmt an, dass beide ebenfalls offline gehen.

Gegeben ist:

- Die Laden-Warteschlange (`packages/core/src/store-queue.ts`) ist geordnet, übersteht ein
  Neuladen, fasst Hin- und Hertippen je Ziel zum Endzustand zusammen und schickt jeden Eintrag über
  eine eigene RPC. Vorübergehende Fehler werden wiederholt, dauerhafte verworfen.
- Beim Einkaufsposten setzt der Server „Abhaken gewinnt“ mit einem Zähler durch
  (`check_seq`): Zurücknehmen greift nur, wenn der Zähler noch dem gesehenen Wert entspricht
  (`docs/architecture/sync.md`, Nachtrag Spec 0003).
- Mehrteilige Aktionen laufen als ein Aufruf in einer Transaktion (`31-sync.md`).
- Hinzufügen und Entfernen von Packstücken und Taschen bleiben online (D34). Sie ändern, was es
  gibt, nicht nur einen Haken, und bräuchten eigene Konfliktregeln.

## Entscheidung

Wir nehmen „gepackt / nicht gepackt“ als fünfte Aktion in die Laden-Warteschlange auf: ein Eintrag
je Packstück mit der Regel „Abhaken gewinnt“ über einen Zähler `pack_seq`. „Alles einpacken“ und
„Für die Rückreise zurücksetzen“ legen in einem Schritt je betroffenem Packstück einen Eintrag an.
Die App schickt eine zusammenhängende Folge solcher Einträge eines Haushalts als **einen** Aufruf
`set_packing_items_packed(household_id, changes)`, der in einer Transaktion je Packstück dieselbe
Regel anwendet.

| Stand auf dem Server                              | Auf dem Gerät getan | Ergebnis                                  |
| ------------------------------------------------- | ------------------- | ----------------------------------------- |
| nicht gepackt                                     | gepackt             | **gepackt** (`pack_seq` + 1, `packed_by`) |
| gepackt                                           | gepackt             | unverändert                               |
| gepackt, `pack_seq` = gesehener Wert              | zurückgenommen      | **nicht gepackt** (`pack_seq` + 1)        |
| gepackt, `pack_seq` ≠ gesehener Wert              | zurückgenommen      | **bleibt gepackt** („Abhaken gewinnt“)    |
| nicht gepackt                                     | zurückgenommen      | unverändert                               |
| Packstück, Tasche oder Abwesenheit inzwischen weg | beliebig            | übersprungen, kein Fehler                 |

## Betrachtete Optionen

### Option A — Ein Eintrag je Packstück, Folgen als ein Aufruf

- **Pro:** Die vorhandene Zusammenfassung je Ziel gilt unverändert: Packen und wieder Auspacken
  vor dem Senden heben sich auf, „Rückgängig“ nach „Alles einpacken“ nimmt genau die eben gepackten
  Stücke zurück, auch offline. Die Regel je Packstück ist dieselbe wie beim Einkaufsposten und
  damit schon verstanden und getestet. Eine Sammel-Aktion ist auf dem Server eine Transaktion.
- **Contra:** Die Warteschlange bekommt eine Sendelogik, die mehrere Einträge bündelt. Eine Folge
  über der Grenze von 200 Änderungen wird auf mehrere Aufrufe verteilt und ist dann nicht mehr eine
  Transaktion; das ist bei Packlisten dieser Größe nicht zu erwarten, aber möglich.

### Option B — Sammel-Aktionen als eigene Einträge mit eigener RPC

`packAll(listBagId)` und `resetPackingList(absenceId)` als eigene Eintragsarten, jede mit einer
eigenen RPC.

- **Pro:** Ein Eintrag je Aktion, wie in ADR-0008 beschrieben; kein Bündeln.
- **Contra:** Für „Abhaken gewinnt“ braucht der Server trotzdem den gesehenen Zähler jedes
  Packstücks, der Eintrag trägt also doch eine Liste. Die Zusammenfassung mit einzelnen Haken davor
  und danach wird zu einer eigenen Regel je Art („Rückgängig“ nach „Alles einpacken“, Einzelhaken
  nach dem Zurücksetzen). Drei RPCs statt einer.

### Option C — Packen nur online (D34 B)

- **Pro:** Kein neuer Offline-Fall, kein Nachtrag, keine Änderung an der Warteschlange.
- **Contra:** Genau am Urlaubsort fehlt oft das Netz. Die Rückreise ließe sich ohne Netz weder
  packen noch zurücksetzen; das ist der Anlass der Funktion.

### Option D — Packen offline, die Sammel-Aktionen nur online (Spec 0012, Offene Frage 1 B)

- **Pro:** Kleinerer Nachtrag; nur Einzelhaken in der Warteschlange.
- **Contra:** „Für die Rückreise zurücksetzen“ ist gerade in der Ferienwohnung gefragt. Ohne Netz
  müsste man 30 Haken einzeln entfernen.

## Begründung

Den Ausschlag gibt, dass die Regel je Packstück schon besteht und bewährt ist: Option A fügt keine
neue Konfliktregel hinzu, sondern nur eine neue Tabelle unter derselben Regel und eine Bündelung
beim Senden. Die Sammel-Aktionen ändern nur Haken; zerlegt in Einträge je Packstück verhalten sie
sich im Konflikt genau so, wie Spec 0012 es fordert (AC-030: ein inzwischen neu gepacktes Stück
bleibt gepackt).

## Konsequenzen

**Positiv:**

- Packen, Auspacken, „Alles einpacken“ samt „Rückgängig“ und „Für die Rückreise zurücksetzen“
  gehen ohne Netz und erscheinen nach dem Abgleich auf allen Geräten.
- Eine RPC für alle Pack-Aktionen; der Server bleibt die einzige Stelle, die „Abhaken gewinnt“
  entscheidet.

**Negativ:**

- Die Laden-Warteschlange heißt weiter so, enthält aber eine Aktion außerhalb des Ladens. Der Name
  bleibt, weil Glossar und Code ihn tragen; das Glossar nennt die neue Aktion.
- Gepackt-Spalten (`packed`, `packed_at`, `packed_by`, `pack_seq`) haben kein Schreibrecht für
  Mitglieder. Ein „Rückgängig“ nach dem Entfernen eines Packstücks braucht deshalb eine eigene
  Domänen-Operation, die den Stand wiederherstellt (`restore_packing_items`).
- Hinzufügen und Entfernen bleiben online. Wer offline ein vergessenes Packstück ergänzen will,
  kann das nicht. Bewusst in Kauf genommen (D34).
- Abmelden mit ungesendeten Haken verliert sie (Regel aus `sync.md`).

**Folgearbeiten:** Spec 0012, `plan.md` Task 0 (Annahme, `31-sync.md`, `AGENTS.md`), Task 2 (RPC), Task 3 (Glossar),
Task 4 (Warteschlange in `core`), Task 5 (Senden in `api`); Nachtrag Spec 0012 in
`docs/architecture/sync.md`.

## Wann diese Entscheidung neu bewertet wird

- Wenn eine weitere Offline-Aktion außerhalb des Ladens dazukommt: Dann ist der Name
  „Laden-Warteschlange“ irreführend und die Warteschlange braucht einen allgemeinen Namen.
- Wenn Packstücke offline ergänzt werden sollen: Das braucht Client-IDs und eine Regel für doppelt
  Ergänztes, wie beim Posten hinzufügen.
- Wenn Packlisten regelmäßig mehr als 200 Packstücke haben und eine Sammel-Aktion dadurch nicht
  mehr in einem Aufruf läuft.
