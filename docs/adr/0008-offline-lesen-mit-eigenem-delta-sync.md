---
status: angenommen
datum: 2026-11-20
autor: agent
betrifft: []
---

# ADR-0008 — Offline lesen mit eigenem Delta-Sync

## Status

`angenommen` · löst [ADR-0002](0002-offline-faehigkeit-und-synchronisation.md) ab

## Kontext

ADR-0002 sah vollständiges Offline-Arbeiten mit PowerSync als zusätzlichem Dienst vor. Nach
Rücksprache gelten zwei neue Vorgaben:

- **So wenige Dienste wie möglich.** Supabase, die App selbst, Web-Hosting und später ein KI-Dienst
  reichen. Ein eigener Sync-Dienst ist nicht gewollt.
- **Offline muss nicht vollständig sein.** Im Supermarkt muss man alles **lesen** und die
  Einkaufsliste **abhaken** können. Anlegen, Bearbeiten und Löschen dürfen Netz voraussetzen.

## Entscheidung

Jedes Gerät hält einen **lokalen Lese-Cache**. Er wird per **Delta-Abgleich** gegen Supabase
aktuell gehalten, inklusive Löschungen. **Schreiben passiert online** direkt gegen Supabase.
Einzige Ausnahme ist **das Abhaken von Einkaufsposten**: Das geht offline, landet in einer kleinen
Warteschlange und wird nach der Regel „Abhaken gewinnt“ nachgereicht. Details:
[`docs/architecture/sync.md`](../architecture/sync.md).

## Betrachtete Optionen

### Option A — PowerSync (ADR-0002)

- **Pro:** vollständig offline, auch beim Schreiben. Ausgereifte Sync-Engine.
- **Contra:** ein zusätzlicher Dienst mit eigenem Account, Dashboard und Free-Tier-Grenzen. Neben
  RLS gibt es eine zweite Berechtigungsregel (Sync Streams). Das ist mehr, als gebraucht wird.

### Option B — Eigener Lese-Cache mit Delta-Abgleich, Schreiben online, Abhaken offline

- **Pro:** kein zusätzlicher Dienst. Berechtigungen nur über RLS, weil der Abgleich über die normale
  Supabase-API läuft. Der Cache lässt sich jederzeit komplett neu laden; das macht Schemaänderungen
  einfach. Es gibt nur einen offline schreibenden Fall, und der ist konfliktarm.
- **Contra:** eigener Sync-Code, den wir testen müssen. Bearbeiten ist offline nicht möglich.

### Option C — Bibliothek Legend-State mit Supabase-Plugin

- **Pro:** kein Dienst, offline schreiben eingebaut.
- **Contra:** Der Sync-Teil ist seit langem in Beta. Weil offline schreiben jetzt gar nicht nötig
  ist, bringt die Bibliothek mehr Komplexität als Nutzen.

### Option D — Eigene Sync-Engine mit Offline-Schreiben für alles

- **Pro:** vollständig offline ohne Dienst.
- **Contra:** Konflikte, Reihenfolge und Teilfehler für jede Tabelle und jede Aktion. Hoher Aufwand
  und hohes Fehlerrisiko für eine Anforderung, die nicht besteht.

## Begründung

Den Ausschlag gibt **„kein weiterer Dienst“ bei abgedeckter Kernsituation**: Im Laden ohne Netz
lesen und abhaken. Option B ist die kleinste Lösung, die genau das leistet.

## Konsequenzen

**Positiv:**

- Dienste: Supabase, Web-Hosting, später ein KI-Dienst. Kein PowerSync-Account.
- Eine Berechtigungslogik: RLS gilt für Lesen, Abgleich und Schreiben gleichermaßen.
- Der Cache ist wegwerfbar. Bei einem Schemawechsel oder einem Fehler lädt das Gerät einfach neu.

**Negativ:**

- Bearbeiten (Rezepte, Wochenplan, Posten hinzufügen) geht nur mit Netz. Die UI zeigt das offline
  klar an.
- Jede synchronisierte Tabelle braucht ein vom Server gesetztes `updated_at` und einen
  Lösch-Trigger ins Löschprotokoll. Der `db-change`-Skill sichert das ab.
- Der Abgleich über Zeitstempel braucht ein Sicherheitsfenster. Sonst können Änderungen aus
  langsamen Transaktionen durchrutschen.
- Das Löschprotokoll muss regelmäßig aufgeräumt werden (`pg_cron`). Geräte, die länger als die
  Aufbewahrungsfrist offline waren, laden voll neu.

**Abgrenzung zu älteren ADRs:** ADR-0001 nennt PowerSync als Grund für Development Builds. Das
entfällt; für den nativen Google-Login bleiben sie trotzdem nötig. ADR-0004 nennt Sync Streams.
Es bleibt bei RLS allein.

**Folgearbeiten:** Die erste Daten-Spec baut den Abgleich in `packages/api` (Cache-Speicher,
Cursor, Löschprotokoll, Realtime-Signal) und die Abhak-Warteschlange samt RPC. Die Merge-Regeln
kommen als reine Funktionen nach `packages/core`. Die Cache-Bibliothek wird im Plan dieser Spec
gewählt.

## Wann diese Entscheidung neu bewertet wird

- Offline-Bearbeiten wird über das Abhaken hinaus gebraucht. Erster Kandidat: Posten im Laden
  hinzufügen. Das ist mit Client-IDs konfliktfrei ergänzbar. Erst wenn mehr nötig wird, PowerSync
  erneut prüfen.
- Der Delta-Abgleich wird spürbar langsam oder fehleranfällig.

## Nachtrag 2026-11-20 — Offline im Einkaufsmodus

Festgelegt im Feature-Konzept (Entscheidung 8): Im Laden fehlt oft das Netz, also gehen dort
**vier** Aktionen auch offline. Alles andere bleibt online.

| Aktion                                     | Konfliktregel                                                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Posten abhaken / Haken zurücknehmen        | wie bisher: „Abhaken gewinnt“                                                                                                                                                                                                   |
| „Nicht da“ (Posten nach „Woanders kaufen“) | letzte Änderung gewinnt; harmlos, weil der Posten offen bleibt                                                                                                                                                                  |
| Posten hinzufügen („Brot vergessen“)       | Der Client vergibt die ID. Der Server ordnet den Namen per `resolve_article` einem Artikel zu und hängt den Beitrag an einen offenen Posten desselben Artikels an, wenn es ihn schon gibt. Es entsteht nie ein doppelter Posten |
| Bereich eines Artikels zuordnen            | letzte Änderung gewinnt                                                                                                                                                                                                         |

- Die bisherige Abhak-Warteschlange wird zur **Laden-Warteschlange** für genau diese vier
  Aktionen. Sie ist geordnet und läuft je Aktion über eine eigene RPC. Vorübergehende Fehler
  werden wiederholt, dauerhafte verworfen und protokolliert.
- Weitere Offline-Aktionen brauchen wie bisher eine Spec und einen weiteren Nachtrag.
