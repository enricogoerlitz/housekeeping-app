---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0039 — Foto-Fenster: wählen, ziehen, einfügen, Bildadresse, Kamera

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
B-01, B-03). **Welle 2.** **Kritischer Pfad:** ja: neue Edge Function lädt fremde Adressen
(Server-seitiger Abruf), Löschen von Dateien.

> **Entwurf vor den Entscheidungen.**

## Ziel

„Foto ändern“ öffnet überall (Rezept, Sammlung, Restaurant, Aktivität) dasselbe Fenster. Am
Desktop ziehe ich ein Bild hinein, füge es mit ⌘V ein, wähle eine Datei oder gebe eine Bildadresse
ein und sehe vorher eine Vorschau. Auf dem Handy wähle ich aus Fotos/Dateien oder nehme direkt ein
Foto auf. Unten steht „Foto entfernen“. Bilder muss ich nicht mehr erst herunterladen.

## Nicht-Ziele

- Kein Zuschneiden/Bearbeiten im Fenster (die KI-Bearbeitung kommt in Spec 0040 als eigener Reiter).
- Keine Fotos an weiteren Einträgen (Märkte, Artikel).

## Anforderungen (Entwurf)

**REQ-001 — Ein Fenster, vier Quellen.** Datei wählen, Ziehen und Ablegen, Einfügen aus der
Zwischenablage (Desktop), Bildadresse mit Vorschau. Offline: nur online.

- AC-001: Angenommen Desktop, „Apfelkuchen“ · Wenn ich ein Bild aus dem Finder ins Fenster ziehe ·
  Dann sehe ich die Vorschau und „Übernehmen“ speichert es
- AC-002: Angenommen eine kopierte Bildadresse `https://…/kuchen.jpg` · Wenn ich sie einfüge · Dann
  lädt der Server das Bild und zeigt die Vorschau
- AC-003: Angenommen die Adresse liefert kein Bild, ist größer als 15 MB oder zeigt auf eine interne
  Adresse · Dann sehe ich „Unter dieser Adresse ist kein passendes Bild“ und nichts wird gespeichert

**REQ-002 — Handy: Fotos, Dateien, Kamera.** „Foto aufnehmen“ öffnet direkt die Kamera.

**REQ-003 — Entfernen mit Nachfrage** (wie Spec 0036 REQ-012).

**REQ-004 — Dateien werden mitgelöscht.** Beantwortet Enricos Frage: Ersetzen oder Entfernen löscht
die alte Datei im Speicher schon heute (vom Gerät aus, nach dem Wechsel). Bleibt dabei eine Datei
zurück (Abbruch, kein Netz), räumt sie OFFEN 2 auf.

## Entscheidungen

1. Bildadresse: neue Edge Function `fetch-image` — nur https, Port 443, IP-Prüfung nach DNS (keine
   privaten/Link-local-Adressen), höchstens 3 Weiterleitungen, 15 MB, 10 s, Inhalt muss ein Bild
   sein; Antwort an die App, die es wie jedes Foto verkleinert und hochlädt. Kontingent `request`.
2. OFFEN: verwaiste Dateien — A: nichts tun (heute akzeptiert) · B: nächtlicher Aufräum-Job
   (`pg_cron` + Funktion) für Dateien ohne Verweis, älter als 1 Tag. Empfehlung B, klein und schließt
   die Lücke dauerhaft.
3. Neues ADR „Abruf fremder Adressen“ (gilt auch für Rezept-Links in Spec 0040).

## Daten

Bestehender Bucket `household-media`; für B neuer `pg_cron`-Job (Infrastruktur, in der Spec benannt).

## Risiken

| Risiko                                 | Gegenmaßnahme                          | Test                       |
| -------------------------------------- | -------------------------------------- | -------------------------- |
| Server ruft interne Adressen ab (SSRF) | DNS-Auflösung + IP-Sperrliste, nur 443 | Unit-Tests je Adressklasse |
| Riesige Antwort                        | Byte-Grenze beim Lesen                 | Test 16 MB → Fehler        |
| Abgemeldet / fremder Haushalt ruft auf | JWT + Haushaltsprüfung                 | Test 401/403               |
| Aufräum-Job löscht benutzte Datei      | nur ohne Verweis und älter als 1 Tag   | pgTAP mit injizierter Zeit |

## Umsetzung

Nach den Entscheidungen.
