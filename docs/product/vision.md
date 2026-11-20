# Produktvision

## Worum es geht

Eine App, mit der ein Haushalt seinen Alltag plant, angefangen beim Essen. Der Haushalt pflegt
**Rezepte**, baut daraus einen **Wochenplan** und erzeugt mit einem Tipp die **Einkaufsliste**.
Die Liste lässt sich von Hand ergänzen und im Laden **in Laufreihenfolge** abarbeiten. Dazu kommen
weitere Haushaltsfunktionen.

Für wen: zunächst ein Paar, das sich einen Haushalt teilt. Technisch ist jeder Haushalt ein
eigener Mandant. Weitere Haushalte sind möglich, die Anmeldung erfolgt nur auf Einladung.

## Grundsätze

1. **Im Laden geht alles, was man dort braucht, auch ohne Netz:** alles lesen und die Liste
   abhaken. Bearbeiten braucht Netz und ist offline klar als solches erkennbar
   ([Sync-Konzept](../architecture/sync.md)).
2. **Alles Strukturierende ist optional.** Ein Artikel ohne Bereich, ein Rezept ohne Foto, ein
   Wochenplan-Eintrag ohne Rezept: Alles ist erlaubt und nichts blockiert.
3. **Gemeinsam, live.** Beide sehen dieselbe Liste. Hakt eine Person etwas ab, sieht es die andere
   sofort, sobald Netz da ist.
4. **Ein Gefühl wie eine native App** auf iPhone, iPad und Android, und trotzdem im Browser
   nutzbar.
5. **Einhändig im Laden.** Große Tippflächen, Wischen statt Tippen, nichts Wichtiges oben links.

## Fachliche Leitplanken (bereits entschieden)

### Artikel und Zutaten

- Ein **Artikel** ist alles, was man kaufen kann, Lebensmittel genauso wie Spülmittel. Er hat im
  Kern **nur einen Namen**, eindeutig je Haushalt. Optional gehört er zu einem Bereich.
- Ein Artikel entsteht **automatisch**, sobald irgendwo ein neuer Name eingegeben wird, im Rezept
  oder auf der Liste. Einen Katalog muss niemand vorab pflegen.
  _Geändert durch UI-Konzept v2 / Spec 0007:_ Im Rezept wählt man den Artikel per „Suchen oder
  anlegen“ und legt einen neuen bewusst an; jede Zutat verweist auf einen Artikel. Auf der Liste
  entsteht er weiter bei der Eingabe.
- Eine **Rezeptzutat** verbindet Rezept und Artikel. Sie hat zwei Angaben:
  - **Rezeptangabe**: wie viel zum Kochen gebraucht wird („200 ml“, „1 Prise“, „2 EL“). Freitext.
    Ist sie als Zahl + Einheit erkennbar, wird sie beim Umrechnen der Portionen mitskaliert.
  - **Einkaufsregel**: wie die Zutat auf die Einkaufsliste kommt.

    | Einkaufsregel             | Beispiel im Rezept | Auf der Liste |
    | ------------------------- | ------------------ | ------------- |
    | **Anzahl** (Standard: 1×) | Milch, 200 ml      | Milch · 1×    |
    | **Rezeptmenge**           | Mehl, 500 g        | Mehl · 500 g  |
    | **Nicht übernehmen**      | Salz, 1 Prise      | —             |

    Für einen Artikel wird die zuletzt gewählte Regel beim nächsten Rezept vorgeschlagen.
- Ein **Einkaufsposten** ist ein Artikel auf einer Liste, **eine Zeile je Artikel**. Kommt derselbe
  Artikel mehrfach vor (zwei Rezepte oder zusätzlich manuell), wird zusammengeführt: Anzahlen und
  Mengen gleicher Einheit werden addiert, alles andere steht nebeneinander („2× · 500 g“). Beim
  Antippen sieht man die Herkunft („Lasagne (Mo): 1× · Pfannkuchen (Mi): 1×“).
- Von Hand: Name tippen (mit Autovervollständigung), optional ein **Zusatz** als Freitext
  („laktosefrei“, „die große Packung“).
- Gespeichert werden die Beiträge je Herkunft, die Summe entsteht erst in der Anzeige. So kann
  „Liste erneut erzeugen“ die Rezept-Beiträge neu berechnen, ohne manuelle Beiträge anzufassen.

### Wochenplan und Liste

- Der Wochenplan hat **konfigurierbare Mahlzeiten** (Standard: Mittag und Abend). Ein Eintrag ist
  ein Rezept mit Portionen oder ein Freitext („Essen bei Oma“).
- Es kann **mehrere Einkaufslisten** geben. Eine davon ist die **Standardliste**, in die der
  Wochenplan schreibt.
  _Geändert durch UI-Konzept v2 / Spec 0006:_ Jeder Haushalt hat genau **eine** Einkaufsliste; die
  Standardliste entfällt, weitere Listen werden in sie zusammengeführt.
- **Liste erneut erzeugen** berechnet nur die Beiträge aus Rezepten neu. Manuelle Posten und
  abgehakte Posten werden nie überschrieben.

### Märkte und Bereiche

- **Bereiche** („Obst & Gemüse“, „Kühlung“, „Drogerie“) gehören dem Haushalt. Ein Artikel wird
  einmal einem Bereich zugeordnet, das ist optional.
- Jeder **Markt** legt nur die **Laufreihenfolge** der Bereiche fest und kann Bereiche ausblenden.
- Im **Einkaufsmodus** wird nach der Laufreihenfolge des gewählten Markts sortiert. Posten ohne
  Bereich stehen am Ende.
- Wird ein Posten im Laden einem Bereich zugeordnet, gilt das künftig für den Artikel.

## Version 1

**Plattform (entschieden):** Das MVP läuft zuerst als **Web-App**, lokal entwickelt und auf dem
Handy als PWA vom Home-Bildschirm genutzt, offline-fähig. Native Apps für iOS und Android aus
derselben Codebasis folgen, sobald das MVP taugt. Dann kommen Xcode, Android Studio und der
Apple-Developer-Account dazu.

**Umfang:** wird im [Feature-Konzept](feature-konzept.md) ausgearbeitet (Entwurf). Kandidaten aus
dem ersten Brainstorming:

| Kandidat                             | Kern                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Fundament: Haushalt, Anmeldung, Sync | Haushalt anlegen, Partnerin oder Partner einladen, Google-Login, Daten offline lesbar auf allen Geräten |
| Design-Fundament                     | `DESIGN.md`, Tokens, Basiskomponenten, Showroom                                                         |
| Rezepte                              | Rezepte mit Zutaten (Rezeptangabe + Einkaufsregel), Portionen, Foto, Schritte                           |
| Wochenplan                           | Rezepte oder Freitext auf Tage und Mahlzeiten verteilen                                                 |
| Einkaufsliste                        | Aus dem Wochenplan erzeugen, von Hand ergänzen, gemeinsam abhaken                                       |
| Märkte und Bereiche                  | Laufreihenfolge je Markt, Einkaufsmodus                                                                 |

## Ideen für später

Keine separate Ideenliste mehr: Was kommt, steht im [Feature-Konzept](feature-konzept.md).
