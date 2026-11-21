# Sync-Konzept: offline lesen, online schreiben

> Entscheidung: [ADR-0008](../adr/0008-offline-lesen-mit-eigenem-delta-sync.md) (löst ADR-0002
> ab). Dieses Dokument beschreibt, **wie** Cache, Abgleich und Abhaken funktionieren, und gilt für
> jede Spec. Details einzelner Tabellen legt die jeweilige Spec fest.

## Ziel

| Ohne Netz möglich                                                                                     | Braucht Netz                               |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Alles **lesen**: Rezepte, Wochenplan, Einkaufslisten, Märkte und Bereiche                             | Anlegen, bearbeiten, löschen               |
| Im Laden: **abhaken**, „nicht da“, Posten **hinzufügen**, Bereich **zuordnen** (Nachtrag zu ADR-0008) | Einkaufsliste aus dem Wochenplan erzeugen  |
| Einkaufsmodus mit Laufreihenfolge                                                                     | Anmelden, Haushalt anlegen, einladen       |
| **Packen**, „Alles einpacken“, „Für die Rückreise zurücksetzen“ (ADR-0013)                            | Packstücke und Taschen ergänzen, entfernen |

Ohne Netz sind Bearbeiten-Aktionen sichtbar deaktiviert, mit dem Hinweis „Offline – zum Bearbeiten
brauchst du Netz“. Das ist ein normaler Zustand, kein Fehler.

## Bausteine

```mermaid
flowchart LR
  subgraph Geraet[Gerät]
    UI[UI] -- liest reaktiv --> C[(Lokaler Cache)]
    UI -- hakt ab --> Q[Abhak-Warteschlange]
    Q -. sofort sichtbar .-> C
  end
  subgraph SB[Supabase]
    API[API + RLS]
    PG[(Postgres)]
    RT[Realtime]
  end
  UI -- "Schreiben (nur online)" --> API
  Q -- "nachreichen, wenn online" --> API
  API --> PG
  PG -- "Delta: geändert + gelöscht seit Cursor" --> C
  PG -- Änderungssignal --> RT -- "jetzt abgleichen" --> C
```

- **Lokaler Cache:** eine Kopie aller Daten der eigenen Haushalte, gespeichert auf dem Gerät (im
  Browser IndexedDB/OPFS). Die UI liest **nur** daraus.
- **Supabase** ist die Quelle der Wahrheit. Gelesen und geschrieben wird über die normale API.
  **RLS gilt damit überall**, eine zweite Berechtigungsregel gibt es nicht.
- **Realtime** dient nur als Signal („es hat sich etwas geändert“). Daraufhin läuft der normale
  Delta-Abgleich. So gibt es genau einen Weg, auf dem Daten in den Cache kommen.

## Lesen: Delta-Abgleich

**Voraussetzungen je synchronisierter Tabelle:**

- `updated_at` wird **vom Server** per Trigger gesetzt, nie vom Client.
- Ein Lösch-Trigger schreibt jede gelöschte Zeile ins **Löschprotokoll** `deleted_records`
  (Tabelle, ID, Haushalt, Zeitpunkt). Es ist per RLS ebenfalls auf den eigenen Haushalt beschränkt.

**Ablauf:**

1. Das Gerät merkt sich je Tabelle einen **Cursor**: das höchste gesehene `updated_at`.
2. Es holt alle Zeilen mit `updated_at > Cursor − Sicherheitsfenster` und schreibt sie per
   Upsert in den Cache. Das **Sicherheitsfenster** (Startwert 2 Minuten) fängt Transaktionen ab,
   die später committen als ihr Zeitstempel. Doppelt geladene Zeilen schaden nicht.
3. Es holt das Löschprotokoll seit dem Cursor und entfernt diese Zeilen aus dem Cache.
4. Es schreibt den Cursor fort, erst wenn Schritt 2 und 3 vollständig geklappt haben.

**Voll-Load** beim ersten Start, nach dem Abmelden und Wiederanmelden, nach einem Wechsel der
Cache-Version und wenn der Cursor älter ist als die Aufbewahrungsfrist des Löschprotokolls
(Startwert 30 Tage, aufgeräumt per `pg_cron`).

**Auslöser:** App-Start, App kommt in den Vordergrund, Netz ist wieder da, direkt nach eigenem
Schreiben, Realtime-Signal, und als Rückfallebene alle paar Minuten, solange die App offen ist.

**Verlust der Mitgliedschaft:** Taucht ein Haushalt nicht mehr in den eigenen Mitgliedschaften auf,
löscht das Gerät dessen Daten aus dem Cache.

## Schreiben: online

- Schreibaktionen gehen direkt an Supabase (API oder RPC). RLS und Constraints prüfen sie.
- Nach Erfolg läuft sofort ein Delta-Abgleich, und der Cache ist aktuell. Wo es sich lohnt, zeigt
  die UI das Ergebnis schon vorher an und korrigiert sich im Fehlerfall.
- **Mehrteilige Aktionen** (z. B. Liste aus dem Wochenplan erzeugen) laufen als eine RPC in einer
  Transaktion. Halbe Zustände gibt es nicht.
- Ändern zwei Personen gleichzeitig online dasselbe, gilt: Was zuletzt ankommt, gewinnt, je Feld.
  Gesendet werden nur geänderte Felder.

## Abhaken: offline

Abhaken und Haken zurücknehmen wirken **sofort lokal** und landen in einer gespeicherten
**Abhak-Warteschlange**. Mit Netz werden sie der Reihe nach per RPC nachgereicht, z. B.
`set_shopping_item_checked(item_id, checked, seen_checked_at)`. Die Regel setzt der Server in
einer Transaktion durch:

| Stand auf dem Server                         | Auf dem Gerät getan  | Ergebnis                                                   |
| -------------------------------------------- | -------------------- | ---------------------------------------------------------- |
| nicht abgehakt                               | abgehakt             | **abgehakt**                                               |
| abgehakt                                     | nichts               | **bleibt abgehakt**, unberührte Posten werden nie gesendet |
| abgehakt, seit dem Gerät bekannt unverändert | Haken zurückgenommen | **nicht abgehakt**                                         |
| inzwischen von jemand anderem abgehakt       | Haken zurückgenommen | **bleibt abgehakt** („Abhaken gewinnt“)                    |
| Posten inzwischen gelöscht                   | beliebig             | verworfen, kein Fehler                                     |

- Mehrfaches Hin- und Hertippen wird zusammengefasst: Gesendet wird nur der Endzustand je Posten.
  Gleicht er dem Ausgangszustand, wird nichts gesendet.
- Die Warteschlange blockiert nie. Vorübergehende Fehler (offline, 5xx, Timeout) werden später
  wiederholt. Dauerhafte Fehler (4xx) werden verworfen und protokolliert.

## Anmeldung offline

- Die Sitzung wird lokal gespeichert. Die App startet offline mit der letzten Sitzung und dem Cache.
- Tokens werden beim nächsten Netz erneuert. Bis dahin liest die App aus dem Cache und sammelt
  Haken.
- **Abmelden löscht Cache und Warteschlange** auf diesem Gerät.

## Web und PWA

Das MVP läuft als Web-App und wird auf dem Handy als PWA vom Home-Bildschirm genutzt (siehe
Vision). Damit sie im Laden ohne Netz überhaupt startet:

- **App-Hülle:** Ein Service Worker cached HTML, JavaScript und Assets.
- **Daten:** Der Cache liegt im Browser-Speicher.
- **iOS Safari:** Nicht installierte Websites können ihren Speicher nach längerer Nichtnutzung
  verlieren. Als PWA zum Home-Bildschirm hinzugefügt ist das deutlich robuster. Die App weist beim
  ersten Start darauf hin.

Der Code bleibt plattformneutral: Datenzugriff nur über `packages/api`, und der Cache-Speicher
steckt hinter einer Schnittstelle. Die nativen Apps bekommen später einen anderen Speicher, aber
denselben Abgleich.

## Schema-Entwicklung

- Der Cache ist **wegwerfbar**. Ändert sich seine Struktur, erhöht die App die Cache-Version und
  lädt einmal voll neu. Eine Client-Migration gibt es nicht.
- Auf dem Server gilt weiter **expand → migrate → contract**, weil ältere App-Versionen dieselbe
  API nutzen.

## Fotos

Fotos lädt das Gerät bei Netz und hält sie im Cache vor. Hochladen geht nur online. Das Detail
regelt die erste Spec mit Fotos.

## Testen

- **Reine Funktionen in `packages/core`:** Delta anwenden (Upsert, Löschungen, Cursor,
  Sicherheitsfenster) und Haken zusammenfassen. Hier liegen die meisten Tests.
- **pgTAP:** RLS je Tabelle, Lösch-Trigger, die Regeln der Abhak-RPC (alle Zeilen der Tabelle oben).
- **Ende-zu-Ende:** zwei Browser, einer offline beim Abhaken, beide wieder online. Kommt mit der
  ersten Daten-Spec.

## Bewusst nicht gewählt

- **Offline-Bearbeiten für alles:** Jede Tabelle bräuchte Konfliktregeln. Erweiterbar je Feature,
  wenn es gebraucht wird. Erster Kandidat: Posten im Laden hinzufügen.
- **PowerSync oder ein anderer Sync-Dienst:** ein Dienst mehr (ADR-0008).

## Nachtrag Spec 0003 — Umsetzung

- **Schreibweg:** Befehle wirken sofort lokal und gehen als genau eine RPC an den Server
  ([ADR-0011](../adr/0011-schreibweg-mit-lokaler-ueberlagerung.md)). Sichtbar ist
  `Serverzeilen ⊕ Laden-Warteschlange ⊕ ausstehende Änderungssätze`. Ein Satz fällt heraus, wenn
  er bestätigt ist und danach ein Pull angewendet wurde; lehnt der Server ab, fällt er und jeder
  spätere Online-Satz heraus, und die App zeigt „Hat nicht geklappt – bitte noch einmal versuchen“.
- **Cursor je Haushalt und Tabelle.** Ein neuer Haushalt lädt voll, ohne die anderen zu stören.
  Profile, Haushalte, Mitgliedschaften und Einladungen kommen bei jedem Pull vollständig, weil
  sich ihre Sichtbarkeit ohne `updated_at` ändert.
- **Grabstein und Zeile mit derselben ID:** Das spätere Ereignis gewinnt (`updated_at` gegen
  `deleted_at`). So erscheint eine per „Rückgängig“ wieder eingefügte Zeile auf allen Geräten.
- **Zeit:** Die 30-Tage-Grenze misst sich an `server_time` aus dem Pull, nie an der Uhr des
  Geräts. `statement_timeout` für `authenticated` bleibt bei 8 s; das deckt das
  Sicherheitsfenster von 2 Minuten.
- **Abhaken:** Statt eines Zeitstempel-Vergleichs zählt der Server `check_seq` bei jedem Wechsel
  von `checked` hoch. Die RPC heißt `set_shopping_item_checked(item_id, checked, seen_check_seq)`;
  Zurücknehmen greift nur, wenn `check_seq` noch dem gesehenen Wert entspricht.
- **Posten hinzufügen:** `add_shopping_contributions` löst den Namen über `name_key` bzw.
  `synonym_keys` auf, die der Client mit `normalizeText` berechnet; so gibt es die Normalisierung
  nur einmal.
- **Realtime:** Statement-Trigger senden `{table}` an das private Topic `household:<id>`; die
  Nachricht enthält keine Zeilendaten.
- **Vertrauensmodell der Grenzen:** `apply_changes` nimmt höchstens 200 Operationen und
  20 Löschungen je Aufruf an; jede ID in einer `remove_contributions`-Operation zählt als Löschung
  und als Operation. Die Grenzen fangen Fehler im Client ab (etwa einen Diff, der versehentlich
  ganze Tabellen löscht), keine böswilligen Mitglieder: Ein Mitglied darf Zeilen seines Haushalts
  ohnehin direkt über die API löschen. Schutz gegen Fremde geben RLS und die Spaltenrechte.
- **Einladungen** werden immer selbst angenommen (`accept_invitation`) oder abgelehnt
  (`decline_invitation`), auch beim ersten Anmelden; das neue Konto bekommt nur sein Profil.

## Nachtrag Spec 0006 — eine Einkaufsliste ohne eigene Tabelle

- **Eine Liste je Haushalt, keine Tabelle:** Die Einkaufsliste ist die Menge der `shopping_items`
  eines Haushalts (ADR-0012). Es gibt weder `shopping_lists` noch `households.default_list_id` noch
  `shopping_items.list_id`. Je Haushalt und Artikel gibt es höchstens einen offenen Posten
  (`shopping_items_open_article_idx (household_id, article_id) where not checked`).
- **Listen-Aktionen nehmen die Haushalts-Kennung:** `add_shopping_contributions`,
  `clear_checked_items`, `clear_shopping_list` und `restore_cleared_items` bekommen
  `p_household_id`; in `apply_changes` landet `add_contributions` im Haushalt des Aufrufs. Ein
  Haushalt, in dem der Aufrufer nicht Mitglied ist, ergibt `not_member` (42501) — auch in den
  security-invoker-Funktionen, damit eine fremde Kennung nicht still ein leeres Ergebnis liefert.
- **Sperre je Haushalt und Artikel:** Hinzufügen, Zurücknehmen eines Hakens und Wiederherstellen
  serialisieren über `private.lock_household_article(household, article)`.
- **Neue RPCs:** `clear_shopping_list` („Liste leeren …“, alle Posten samt Erledigtem, Rückgabe für
  „Rückgängig“) und `adjust_item_count` (+ und −, ein Aufruf je Tipp, atomar unter der Zeilensperre
  des Postens).
- **Laden-Warteschlange:** Ein „Hinzufügen“ trägt die Haushalts-Kennung. Fehler, die unsere
  Funktionen absichtlich werfen (SQLSTATE P0001/P0002, PostgREST antwortet darauf mit 500), sind
  endgültig: Der Eintrag wird verworfen und blockiert die Warteschlange nicht.
- **Speicher-Version 3:** Der Cache wird einmal neu geladen; Warteschlange, gewählter Haushalt und
  gewählter Markt des Geräts bleiben dabei erhalten.

## Nachtrag Spec 0007 — Artikel-Katalog, Märkte und Bereiche

- **Artikel werden nie direkt gelöscht:** `authenticated` hat kein `delete`-Recht auf `articles`,
  und die Allowlist von `apply_changes` steht für `articles` auf `"delete": false`; ein Diff
  schickt nie das Löschen eines Artikels. Gelöscht wird nur über zwei RPCs:
  - `delete_article` sperrt die Zeile `for update` und prüft erst danach „unbenutzt“ (in keinem
    Rezept, in keinem Posten, offen oder erledigt; sonst `article_in_use`). Es gibt die gelöschte
    Zeile zurück; „Rückgängig“ fügt sie über `apply_changes` wieder ein.
  - `merge_articles` führt die Quelle in einer Transaktion ins Ziel: Zutaten in
    `recipes.ingredients` umschreiben (zwei Zeilen im selben Rezept bleiben zwei), stehen beide
    offen auf der Liste, die Beiträge in den Posten des Ziels ziehen und den Quellposten löschen,
    übrige Posten der Quelle aufs Ziel, leere Angaben des Ziels füllen, die Quelle löschen, Name
    und Synonyme der Quelle als Synonyme ans Ziel. Mehr als 30 Synonyme oder mehr als 2000 Zeichen
    in allen Synonymen oder ihren Schlüsseln ergeben `too_many_synonyms`, und nichts ändert sich.
- **Bereiche:** `merge_areas` („Zusammenlegen“) ist eine RPC: Sie zieht die Artikel um, nimmt die
  Quelle aus `area_order` und `hidden_area_ids` jedes Markts und löscht sie. Einen Bereich löschen
  schickt `apply_changes` mit dem Löschen des Bereichs und dem Patch der Laufreihenfolge jedes
  betroffenen Markts im selben Änderungssatz; die Artikel verlieren den Bereich über den
  Fremdschlüssel (`on delete set null`, mit neuem `updated_at`).
- **Weiterleitung nach dem Zusammenführen:** Der Grabstein eines beim Zusammenführen gelöschten
  Postens trägt `deleted_records.replaced_by` (die ID des Postens des Ziels). Mitglieder können die
  Spalte nicht schreiben. `set_shopping_item_checked` und `set_shopping_item_not_available` folgen
  dem Verweis, wenn der Posten selbst fehlt: höchstens 5 Schritte, nur im Haushalt des Grabsteins
  und nur, wenn der Aufrufer dort Mitglied ist, sonst `null` wie bisher. Ein offline gemachter
  Haken auf die Quelle trifft so den Posten des Ziels (AC-040). Ein Zurücknehmen auf einen
  ersetzten Posten bleibt wirkungslos, weil der gesehene `check_seq` zum alten Posten gehört. Die
  30-Tage-Aufbewahrung der Grabsteine gilt auch für die Verweise.
- **Bereich zuordnen aus der Warteschlange:** `assign_article_area` gibt `null` zurück, wenn der
  Artikel fehlt (gelöscht oder zusammengeführt) oder der Bereich fehlt oder zu einem anderen
  Haushalt gehört; der Eintrag wird ohne Fehler verworfen. Für Bereichszuordnungen gibt es keine
  Weiterleitung.
- **Zutaten zeigen immer auf einen Artikel:** Der Trigger `recipes_check_ingredients` (vor
  Einfügen und vor Ändern von `ingredients`) verlangt je Zutat eine `articleId` eines Artikels des
  eigenen Haushalts und einen `prepNote` von höchstens 200 Zeichen, sonst
  `ingredient_article_invalid` (23503). Er liest die Artikel `for key share`, damit
  `delete_article` und `merge_articles` keinen davon entfernen, während das Rezept gespeichert
  wird.
- **Sperr-Reihenfolge:** `merge_articles` sperrt zuerst je Haushalt und Artikel
  (`lock_household_article`, wie die Laden-RPCs), dann die betroffenen Rezepte `for update`, dann
  die beiden Artikel `for update`. Ein gleichzeitiges Ändern von Zutaten sperrt erst die
  Rezeptzeile und liest dann die Artikel; weil beide die Rezepte vor den Artikeln sperren, können
  sie sich nicht gegenseitig blockieren. Bricht Postgres einen Aufruf trotzdem wegen Deadlock oder
  Serialisierung ab (40P01, 40001), wurde nichts geschrieben; der Transport versucht ihn genau
  einmal neu.
- **Eindeutigkeit:** Name und Synonyme eines Artikels kollidieren mit keinem Namen oder Synonym
  eines anderen Artikels desselben Haushalts (Trigger unter Haushalts-Sperre, `name_taken`);
  Bereichsnamen sind je Haushalt eindeutig über `lower(name)`. `name_key` und `synonym_keys`
  berechnet das Gerät (`normalizeText`); die Datenbank verlässt sich darauf, dass Mitglieder sie
  ehrlich schicken — ein falscher Schlüssel wirkt nur im eigenen Haushalt.
- **Speicher-Version 4:** neue Felder an Artikeln (`defaultShoppingRule`, `needsReview`) und
  Zutaten (`prepNote`, kein `name` mehr). Der Cache wird einmal neu geladen; Warteschlange,
  gewählter Haushalt und gewählter Markt bleiben erhalten.

## Nachtrag Spec 0011 — Erledigungen mit Bedingung, Bewertungen in halben Schritten

- **Erledigungen nur über Domänen-Operationen:** Mitglieder haben auf `chore_events` nur noch
  `select` und `update (chore_id, done_by)`; `insert` und `delete` sind entzogen, und die
  Allowlist von `apply_changes` erlaubt für `chore_events` weder `insert` noch `delete`. Gebucht
  wird mit der Operation `complete_chore` (`{"kind": "complete_chore", "completion": {…}}`),
  entfernt mit `remove_chore_event` (`{"kind": "remove_chore_event", "id": …}`). Beide laufen in
  derselben Transaktion wie der Rest des Aufrufs; eine neue Aufgabe aus „Was anderes erledigt?“
  geht als `insert` auf `chores` plus `complete_chore` in einen Aufruf.
- **Bedingung statt „letzte Änderung gewinnt“:** `complete_chore` sperrt die Aufgabe und bucht nur,
  wenn `next_due_on`, `last_done_on`, `next_assignee_id` und die zuletzt gebuchte Erledigung
  (`latest_event_id`, nach `created_at` auf die Mikrosekunde, dann `id`; `null` ohne Erledigung)
  noch dem gesehenen Stand (`seen`) entsprechen. Die Erledigung braucht es, weil eine zweite
  Buchung einer flexiblen Aufgabe für „egal wer“ am selben Tag die drei Spalten unverändert lässt.
  Sonst schreibt der Server nichts und antwortet `already_done` (P0001, `detail` mit
  `done_by` und `done_at`), wenn es am selben Tag schon eine Erledigung gibt, sonst
  `chore_changed` (P0001). Nächster Termin und nächste Person rechnet weiter `core`; der Server
  prüft nur die Grenzen (Tag heute − 3 bis heute + 1 nach Server-Datum, Termin nach dem Tag, kein
  Termin bei „bei Bedarf“).
- **Der Stand davor liegt an der Erledigung:** `prev_next_due_on`, `prev_last_done_on`,
  `prev_next_assignee_id` und `prev_recorded` setzt nur `complete_chore`, aus der gesperrten
  Zeile. Sie kommen wie jede Spalte über den Delta-Abgleich auf die Geräte, werden aber nie
  zurückgeschrieben. `remove_chore_event` stellt sie wieder her, wenn der Eintrag der zuletzt
  gebuchte seiner noch vorhandenen Aufgabe ist (`created_at`, dann `id`). Entfernen gewinnt gegen
  ein gleichzeitiges Ändern: Die spätere Änderung trifft keine Zeile mehr (`row_not_found`).
- **Zeitpunkt des Eintrags:** `created_at` einer Erledigung aus `complete_chore` ist
  `clock_timestamp()` (Trigger `chore_events_stamp_booking`), nicht der Beginn der Transaktion.
  Zwei Erledigungen derselben Aufgabe in einem Aufruf behalten so ihre Reihenfolge, und eine
  Erledigung, die auf die Sperre gewartet hat, liegt hinter der, auf die sie gewartet hat.
  `updated_at` bleibt `now()`; der Delta-Abgleich liest nur `updated_at`.
- **Die Verknüpfung bleibt:** `chore_id` einer Erledigung wechselt nur von leer auf eine Aufgabe
  („Rückgängig“ nach dem Löschen) und wird nur durch das Löschen der Aufgabe leer. Jede andere
  Änderung lehnt der Trigger `chore_events_keep_chore` mit `invalid_change` (22023) ab. Sonst
  stellte `remove_chore_event` den Stand davor an der falschen Aufgabe her.
- **Grenzen:** `complete_chore` und `remove_chore_event` zählen je als eine Operation und eine
  Löschung. Ob `complete_chore` eine einmalige Aufgabe löscht, steht erst unter der Sperre fest;
  darum zählt jede Buchung.
- **Bewertungen:** `stars` ist `numeric(2,1)` (0,5 bis 5 in halben Schritten). Die
  `set_*_rating`-RPCs prüfen den ungerundeten Wert und schreiben immer, auch denselben Wert noch
  einmal; `updated_at` der Bewertungszeile sagt damit, wann die Person zuletzt bewertet hat.
- **Auf dem Gerät:** `ChoreEvent.previous` (aus `prev_*`, nur bei `prev_recorded`),
  `ChoreEvent.createdAt` und `ratedAt` (aus `updated_at` der eigenen Bewertungszeile) kommen nur
  vom Server; ein Diff schickt sie nie. Die Überlagerung zeigt eine neue Bewertung sofort mit
  `ratedAt`. Jeder Befehl ist genau ein `apply_changes`-Aufruf: Abhaken, Überspringen und
  Nachtragen schicken `complete_chore` mit dem gesehenen Stand, „Was anderes erledigt?“ ohne
  Treffer zusätzlich das `insert` der neuen Aufgabe davor; „Rückgängig“ schickt
  `remove_chore_event`. Die Cache-Version ist 5.

## Nachtrag Spec 0012 — Packen ohne Netz

Entscheidung: [ADR-0013](../adr/0013-packen-ohne-netz.md). Die Datenbank- und App-Teile ergänzen
die Tasks 2 und 5 von Spec 0012.

- **Packen ohne Netz.** „Gepackt / nicht gepackt“ ist eine weitere Aktion der
  Laden-Warteschlange mit der Regel „Abhaken gewinnt“ über den Zähler `pack_seq`: Packen gewinnt
  immer, Zurücknehmen greift nur, wenn `pack_seq` noch dem gesehenen Wert entspricht.
- **Sammel-Aktionen.** „Alles einpacken“ und „Für die Rückreise zurücksetzen“ legen je Packstück
  einen Eintrag an. Hin- und Hertippen fasst die Warteschlange wie beim Einkaufsposten je
  Packstück zum Endzustand zusammen; „Rückgängig“ nach „Alles einpacken“ nimmt so genau die eben
  gepackten Stücke zurück, auch ohne Netz.
- **Ein Aufruf je Folge.** Eine zusammenhängende Folge von Pack-Einträgen eines Haushalts geht als
  ein Aufruf `set_packing_items_packed(household_id, changes)` in einer Transaktion an den Server,
  höchstens 200 Änderungen je Aufruf. Die Folge endet am ersten Eintrag eines anderen Haushalts
  oder einer anderen Art.
- **Fehlende Packstücke** (Packstück, Tasche oder Abwesenheit inzwischen gelöscht, oder fremder
  Haushalt) überspringt der Server ohne Fehler; der Eintrag gilt als bestätigt und blockiert die
  Warteschlange nie.
- **Online bleiben** Hinzufügen und Entfernen von Packstücken und Taschen. Die Gepackt-Spalten
  (`packed`, `packed_at`, `packed_by`, `pack_seq`) schreibt nur der Server.

**Datenbank (Spec 0012, Task 1 und 2):**

- **Vier Tabellen**, alle mandantengebunden, mit RLS, Grants, Grabstein und Sync:
  `packing_bags` (Reisetaschen, Name eindeutig über `lower(name)` je Haushalt, optional „für“ ein
  Mitglied), `packing_bag_items` (Packstücke der Reisetasche, feste Anzahl 1–99 oder „je Tag“),
  `packing_list_bags` (Tasche der Packliste: Abwesenheit, Herkunftstasche, Name und Mitglied als
  Kopie, Reihenfolge; dieselbe Reisetasche höchstens einmal je Abwesenheit) und `packing_items`
  (Packstücke der Packliste). `sync_pull` liefert alle vier.
- **„Je Tag“ rechnet der Server.** Ein Trigger vor dem Einfügen setzt bei `per_day` die Anzahl auf
  `least(per_day × Tage, 9999)` (Tage = `to_on − from_on + 1`), egal was das Gerät schickt. Ändern
  sich Von oder Bis einer Abwesenheit oder zieht eine Tasche der Packliste zu einer anderen
  Abwesenheit, rechnet ein Trigger die **offenen** „je Tag“-Packstücke dieser Abwesenheit neu;
  gepackte behalten ihre Anzahl. Nur geänderte Zeilen werden geschrieben und bekommen ein neues
  `updated_at`.
- **Gepackt-Spalten schreibt nur der Server:** `packed`, `packed_at`, `packed_by`, `pack_seq`
  haben kein Grant und stehen nicht in der Allowlist; `packing_items` hat gar kein `update`-Grant
  und in `apply_changes` kein `patch`. Ein Einfügen durch `authenticated` startet immer offen.
- **`set_packing_items_packed(p_household_id, p_changes)`:** 1 bis 200 Änderungen
  `{item_id, packed, seen_pack_seq}` (genau diese Schlüssel, keine Kennung doppelt), sonst
  `invalid_change` bzw. `too_many_changes` (22023); kein Mitglied → `not_member` (42501). Die
  gefundenen Packstücke werden nach `id` sortiert gesperrt, je Packstück gilt die Regeltabelle aus
  ADR-0013. Fehlende oder fremde Kennungen werden übersprungen. Antwort: `[{item_id, packed,
pack_seq}]` der gefundenen Packstücke.
- **Rückgängig nach dem Entfernen:** Domänen-Operation
  `{"kind": "restore_packing_items", "items": [...]}` in `apply_changes`, zählt als ihre Elemente.
  Elemente mit `id`, `list_bag_id`, `name` (Pflicht) und `quantity`, `per_day`, `sort`, `packed`,
  `packed_at`, `packed_by`, `pack_seq`; einfaches Einfügen (vorhandene Kennung → 23505, fremde
  Tasche oder fremde Person → 23503), `packed_at` höchstens `now()`, `pack_seq` 0 bis 999000.
- **Kaskaden:** Abwesenheit löschen löscht ihre Taschen der Packliste und deren Packstücke;
  Reisetasche löschen löscht ihre Packstücke und leert `packing_list_bags.bag_id`; Tasche der
  Packliste löschen löscht ihre Packstücke. Jede mitgelöschte Zeile bekommt ihren Grabstein, das
  Gerät schickt also nur die Löschung der Eltern-Zeile. Verlässt jemand den Haushalt, werden
  „für“ und „gepackt von“ leer; die eigenen Abwesenheiten gehen samt Packliste mit.
