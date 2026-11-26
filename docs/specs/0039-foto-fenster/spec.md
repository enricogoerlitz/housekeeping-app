---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0039 — Foto-Fenster: wählen, ziehen, einfügen, Bildadresse, Kamera

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
B-01, B-03). **Welle 2.** **Kritischer Pfad:** ja: neue Edge Function lädt fremde Adressen
(Server-seitiger Abruf), Löschen von Dateien.

## Ziel

„Foto ändern“ öffnet überall (Rezept, Sammlung, Restaurant, Aktivität) dasselbe Fenster. Am
Desktop ziehe ich ein Bild hinein, füge es mit ⌘V ein, wähle eine Datei oder gebe eine Bildadresse
ein und sehe vorher eine Vorschau. Auf dem Handy wähle ich aus Fotos/Dateien oder nehme direkt ein
Foto auf. Unten steht „Foto entfernen“. Bilder muss ich nicht mehr erst herunterladen.

## Nicht-Ziele

- Kein Zuschneiden/Bearbeiten im Fenster (die KI-Bearbeitung kommt in Spec 0040 als eigener Reiter).
- Keine Fotos an weiteren Einträgen (Märkte, Artikel).

## Anforderungen

Gilt für Rezept, Sammlung, Restaurant und Aktivität. „Übernehmen“ verkleinert das Bild wie heute
(längste Seite 1600 px, JPEG) und speichert es; alle Wege sind **nur online**.

**REQ-001 — Ein Fenster „Foto“.** „Foto ändern“ (bzw. „Foto hinzufügen“) öffnet überall dasselbe
Fenster mit Vorschau, „Übernehmen“, „Abbrechen“ und — falls es ein Foto gibt — unten „Foto entfernen“
(mit Nachfrage, Spec 0036). Ersetzt die Knöpfe nebeneinander. Quelle: B-01. Offline: nur online.

- AC-001: Angenommen „AMRIT“ mit Foto · Wenn ich „Foto ändern“ tippe · Dann ist das Fenster „Foto“
  mit dem jetzigen Foto als Vorschau und „Foto entfernen“ offen
- AC-002: Angenommen ich wähle ein neues Bild und tippe „Abbrechen“ · Dann bleibt das alte Foto

**REQ-002 — Desktop: wählen, ziehen, einfügen.** Datei wählen, Bild ins Fenster ziehen oder mit ⌘V/
Strg+V einfügen (Bilddatei oder kopiertes Bild). Quelle: B-01. Offline: nur online.

- AC-003: Angenommen Desktop · Wenn ich ein JPEG aus dem Finder ins Fenster ziehe · Dann zeigt die
  Vorschau das Bild · Und „Übernehmen“ speichert es
- AC-004: Angenommen ein im Browser kopiertes Bild · Wenn ich im Fenster ⌘V drücke · Dann zeigt die
  Vorschau das Bild
- AC-005: Angenommen ich ziehe eine PDF-Datei hinein · Dann sagt die App „Das ist kein Bild“

**REQ-003 — Bildadresse.** Ein Feld „Bildadresse“: Nach Einfügen einer Adresse lädt der Server das
Bild und zeigt die Vorschau. Quelle: B-01. Offline: nur online.

- AC-006: Angenommen eine kopierte Google-„Bildadresse“ `https://…/kuchen.jpg` · Wenn ich sie einfüge ·
  Dann zeigt die Vorschau nach höchstens 10 s das Bild
- AC-007: Angenommen die Adresse liefert HTML, ist größer als 15 MB, braucht länger als 10 s oder zeigt
  auf eine interne Adresse (`http://localhost`, `10.0.0.1`, `169.254.169.254`) · Dann sagt die App
  „Unter dieser Adresse ist kein passendes Bild“, und nichts wird gespeichert
- AC-008: Angenommen abgemeldet · Wenn jemand die Funktion direkt aufruft · Dann antwortet sie 401

**REQ-004 — Handy: Fotos, Kamera, Dateien.** Auf dem Handy drei Knöpfe: „Fotomediathek“, „Foto
aufnehmen“ (öffnet direkt die Kamera), „Datei wählen“; dazu das Feld „Bildadresse“. Quelle: B-01.
Offline: nur online.

- AC-009: Angenommen iPhone · Wenn ich „Foto aufnehmen“ tippe · Dann öffnet sich die Kamera, und das
  aufgenommene Foto steht in der Vorschau

**REQ-005 — Verwaiste Dateien aufräumen.** Ein nächtlicher Lauf löscht Dateien im Foto-Speicher, auf
die kein Eintrag verweist und die älter als ein Tag sind. Beantwortet Enricos Frage: Ersetzen oder
Entfernen löscht die alte Datei schon heute; dieser Lauf fängt die Fälle ab, in denen das abbricht.
Quelle: B-03. Offline: entfällt (Server).

- AC-010: Angenommen eine Datei ohne Verweis von vorgestern · Wenn der Lauf läuft · Dann ist sie weg
- AC-011: Angenommen eine Datei ohne Verweis von vor einer Stunde (Upload läuft) · Dann bleibt sie
- AC-012: Angenommen eine Datei mit Verweis von „Apfelkuchen“ · Dann bleibt sie

## Entscheidungen

1. Bildadresse: neue Edge Function `fetch-image` mit gemeinsamem Baustein `_shared/fetch-public.ts`
   (auch für Spec 0040): nur https, Port 443, DNS-Auflösung und Sperre privater, Loopback- und
   Link-local-Adressen vor jedem Abruf und jeder Weiterleitung, höchstens 3 Weiterleitungen, 15 MB,
   10 s, Content-Type `image/*` und Bild-Signatur geprüft. Antwort sind die Bilddaten; die App
   verkleinert und lädt hoch wie jedes Foto. Kein Kontingent.
2. Enrico, 26.11.: Aufräum-Lauf als `pg_cron`-Job, der eine Funktion mit injizierbarer Zeit (`p_now`)
   aufruft; die Funktion listet Dateien ohne Verweis, das Löschen geschieht über die Storage-API
   (Edge Function, vom Job über `pg_net` mit Signatur wie `push-send` angestoßen).
3. Neues ADR-0016 „Bildmodell und Abruf fremder Seiten“ (gemeinsam mit Spec 0040).
4. `fetchPublic(url, { maxBytes, contentTypes, timeoutMs, maxRedirects, accept? })` ist der
   Baustein für beide Specs (0040: HTML bis 2 MB). Gesperrt wird jede Adresse außerhalb des
   öffentlichen Netzes (IPv4-Sonderbereiche inkl. CGNAT und Multicast; IPv6 nur 2000::/3 ohne
   Teredo, 6to4, Dokumentation — also auch ULA, IPv4-mapped, NAT64) und jeder Host ohne Punkt; löst
   ein Name auf mehrere Adressen auf, muss jede öffentlich sein. Restrisiko DNS-Rebinding siehe
   ADR-0016.
5. `fetch-image` prüft die Mitgliedschaft im Haushalt (`householdId` im Aufruf, unter RLS) und
   antwortet sonst `403 forbidden`; jede unbrauchbare Adresse ist `422 not_an_image`. Die Bytes
   kommen als `application/octet-stream`; die App bestimmt das Format an der Signatur (core
   `imageTypeOf`, per `pnpm gen:edge` auch im Server) — SVG nie.
6. Das Fenster ersetzt die Knöpfe unter dem Foto der Detailseiten (Rezept, Sammlung, Restaurant,
   Aktivität); „Foto ändern“ im ⋯-Menü des Rezepts öffnet es auch. Das Feld „Foto (optional)“ in
   den Formularen „Restaurant/Aktivität anlegen“ bleibt beim bisherigen Auswählen (ein Fenster im
   Fenster wäre nötig; nicht verlangt). Die Ansicht „Bild wählen“ ist die einzige; Spec 0040 fügt
   „KI“ als zweite hinzu, dann erscheint die Reiterzeile.
7. Handy: „Fotomediathek“ und „Datei wählen“ öffnen auf dem iPhone dasselbe System-Menü (eine
   Web-App kann nicht gezielt nur die Mediathek öffnen); „Foto aufnehmen“ öffnet direkt die Kamera
   (`capture`). Desktop: nur „Datei wählen“, dazu Ziehen und ⌘V/Strg+V, solange das Fenster offen
   ist.
8. Aufräumen: Job `media-orphan-sweep`, `30 2 * * *` (UTC; 03:30 Berlin im Winter, 04:30 im
   Sommer — pg_cron rechnet in UTC), höchstens 500 Dateien je Lauf. „Ohne Verweis“ heißt: kein
   `photo_path` in Rezepten (inkl. Sammlungen), Aktivitäten, Restaurants und kein Snapshot einer
   Löschung, die noch rückgängig gemacht werden kann. Nur Namen der Foto-Ordner, nur
   `household-media`. Geheimnis `MEDIA_SWEEP_SECRET` (Function-Secret) und Vault
   `media_sweep_secret`, `media_sweep_url`; Header `x-sweep-timestamp`/`x-sweep-signature`.
   `media-sweep` liest als einzige Funktion den Server-Schlüssel (`SUPABASE_SECRET_KEYS`, sonst
   `SUPABASE_SERVICE_ROLE_KEY`), weil nur er über Haushalte hinweg löschen darf.

## Daten

Bestehender Bucket `household-media`, keine neue Tabelle. Migration `media_orphan_sweep`:
`private.media_orphans(p_now)`, `private.media_sweep_config()`,
`private.run_media_orphan_sweep(p_now)` (ohne Grants) und der `pg_cron`-Job `media-orphan-sweep`
(Infrastruktur, `30 2 * * *` UTC), Ziel-URL und Geheimnis im Vault. Neue Edge Functions
`fetch-image` und `media-sweep`; Fehlercodes `forbidden`, `not_an_image` im Vertrag.
**Für den Betrieb (Enrico):** `MEDIA_SWEEP_SECRET` erzeugen, als Function-Secret und im Vault
(`media_sweep_secret`, dazu `media_sweep_url` = `<Projekt>/functions/v1/media-sweep`) setzen;
ohne sie warnt der Job `media_sweep_not_configured` und löscht nichts.

## Risiken

| Risiko                                   | Gegenmaßnahme                                                         | Test                              |
| ---------------------------------------- | --------------------------------------------------------------------- | --------------------------------- |
| Server ruft interne Adressen ab (SSRF)   | DNS-Prüfung vor jedem Hop, nur 443                                    | Unit-Tests je Adressklasse        |
| DNS-Rebinding zwischen Prüfung und Abruf | Restrisiko (ADR-0016): nur angemeldete Mitglieder                     | —                                 |
| Riesige oder langsame Antwort            | Byte-Grenze beim Lesen, 10 s                                          | Tests 16 MB, Zeitüberschreitung   |
| Abgemeldet / fremder Haushalt            | JWT + Mitgliedschaft                                                  | AC-008, Test 403                  |
| Bild ist Code (SVG) oder lügt im Typ     | Signaturprüfung im Server und in der App                              | Test SVG / HTML                   |
| Aufräumen löscht benutzte Datei          | nur ohne Verweis und älter als 1 Tag                                  | pgTAP mit `p_now` (AC-010–AC-012) |
| Aufräum-Aufruf von außen                 | HMAC-Signatur wie `push-send`                                         | Test ohne/mit falscher Signatur   |
| Server-Schlüssel in `media-sweep`        | nur dort, nur signiert, nur Namen der Foto-Ordner, keine Namen im Log | Tests 401/400                     |
| Mitglied startet den Lauf selbst         | Funktionen ohne Grants                                                | pgTAP 42501                       |

## Umsetzung

- [ ] 1. `_shared/fetch-public.ts` + `fetch-image` (AC-006–AC-008), ADR-0016
- [ ] 2. Fenster „Foto“ in der App, überall eingesetzt (AC-001, AC-002)
- [ ] 3. Desktop: Ziehen, Einfügen, Prüfung (AC-003–AC-005)
- [ ] 4. Handy: Mediathek, Kamera, Datei (AC-009)
- [ ] 5. Aufräum-Funktion, Job, Edge Function (AC-010–AC-012)
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün;
      `pnpm exec supabase test db`; `/security-check`
