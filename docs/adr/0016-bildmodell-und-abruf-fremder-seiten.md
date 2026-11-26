---
status: angenommen
datum: 2026-11-26
autor: agent
betrifft: [0039, 0040]
---

# ADR-0016 — Bildmodell und Abruf fremder Seiten

## Status

`angenommen` (Enrico, Review 0003 vom 26.11.2026; Specs 0039 und 0040 freigegeben)

## Kontext

Mit Review 0003 kommen zwei Fähigkeiten, die ADR-0009 (KI über Microsoft Foundry, nur aus Edge
Functions) nicht abdeckt:

1. **Fremde Adressen abrufen.** Im Fenster „Foto“ (Spec 0039) fügt man eine Bildadresse ein; in
   Spec 0040 einen Rezept-Link. Der Browser kann fremde Bilder und Seiten meist nicht selbst laden
   (CORS), und die App soll das Bild nicht erst herunterladen lassen. Bisher ruft nur
   `resolve-maps-link` fremde Adressen ab, und zwar nur Google-Hosts aus einer festen Liste. Eine
   beliebige Adresse vom Server abzurufen ist eine SSRF-Lücke, wenn sie interne Ziele erreicht
   (Metadaten-Dienst `169.254.169.254`, `localhost`, das Docker-Netz der Supabase-Dienste).
   `10-security.md` verlangt: serverseitig, Schema- und Größengrenze, Zeitlimit, keine internen
   Adressen.
2. **Ein Bildmodell.** Spec 0040 erzeugt und bearbeitet Rezeptfotos mit KI. Im Foundry-Projekt
   steht FLUX.2-pro (Black Forest Labs) bereit; der Aufruf ist erprobt
   (`tmp/review-0003/recherche.md`, Skill `recipe-crud`): `POST
https://<resource>.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro?api-version=preview`,
   Header `api-key`, Body `{ model, prompt, width, height, output_format: 'jpeg', input_image? }`,
   Antwort `data[0].b64_json`, etwa 8 s und 3–4,5 ct je Bild.

Dazu gehört das **Aufräumen**: Fotos, auf die keine Zeile mehr zeigt (Abbruch beim Ersetzen,
später verworfene KI-Varianten), bleiben sonst im Bucket `household-media`. Löschen geht nur über
die Storage-API; ein direktes `delete` in `storage.objects` lässt die Datei im Speicher-Backend.

Gegeben: Supabase Edge Functions (Deno), keine eigene Infrastruktur (ADR-0007), keine Schlüssel in
der App, Kontingente nur dort, wo Enrico sie will (für die neuen Funktionen: keine).

## Entscheidung

Wir rufen fremde Adressen nur über den gemeinsamen Baustein `supabase/functions/_shared/fetch-public.ts`
ab, erzeugen Bilder mit FLUX.2-pro über den BFL-Pfad von Foundry aus einer Edge Function, und
räumen verwaiste Fotos nachts mit einem `pg_cron`-Job auf, der die Edge Function `media-sweep`
signiert anstößt.

- **`fetchPublic(url, { maxBytes, contentTypes, timeoutMs, maxRedirects, accept? }, deps)`:**
  nur `https:`, Port 443, kein Benutzername/Passwort, kein Host ohne Punkt; vor **jedem** Abruf
  (auch jeder Weiterleitung) DNS-Auflösung (A und AAAA) und Abbruch, wenn auch nur eine Adresse
  nicht öffentlich ist (IPv4: 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24,
  192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4;
  IPv6: nur 2000::/3 ohne Teredo, 6to4, Dokumentation — damit fallen Loopback, ULA, Link-local,
  Multicast, IPv4-mapped und NAT64 heraus); Weiterleitungen von Hand, höchstens
  `maxRedirects`; eine Frist für alles; Body mit Byte-Grenze gelesen; Content-Type gegen die
  erlaubten Typen (`image/*` oder exakt, z. B. `text/html`). Fehler sind Gründe
  (`blocked_address`, `too_large`, `wrong_type`, `timeout`, …), nie Inhalte im Log.
- **`fetch-image`** (Spec 0039): angemeldet + Mitglied des Haushalts, 15 MB, 10 s, 3
  Weiterleitungen, `image/*` und Bild-Signatur (JPEG, PNG, GIF, WebP, AVIF; nie SVG); Antwort sind
  die Bytes (`application/octet-stream`), die App verkleinert und lädt hoch wie jedes Foto.
  Spec 0040 nutzt denselben Baustein für Rezeptseiten (HTML bis 2 MB).
- **Bildmodell** (Spec 0040): FLUX.2-pro über den BFL-Pfad, eigener kleiner Client neben
  `_shared/foundry.ts`; Deployment-Name aus `FOUNDRY_IMAGE_DEPLOYMENT`, Resource aus
  `FOUNDRY_OPENAI_BASE_URL`, Schlüssel `FOUNDRY_API_KEY` (wie ADR-0009: nur Function-Secrets).
- **Aufräumen** (Spec 0039): `private.media_orphans(p_now)` listet Dateien der Foto-Ordner ohne
  Verweis (Rezept, Aktivität, Restaurant, Snapshot einer noch wiederherstellbaren Löschung), älter
  als ein Tag; `private.run_media_orphan_sweep(p_now)` schickt sie über `pg_net` an
  `media-sweep`, signiert mit HMAC-SHA256 wie `push-send` (ADR-0014); Ziel und Geheimnis im Vault
  (`media_sweep_url`, `media_sweep_secret`). Job `media-orphan-sweep`, täglich 02:30 UTC.
  `media-sweep` ist die einzige Funktion mit dem Server-Schlüssel (`SUPABASE_SECRET_KEYS`, sonst
  `SUPABASE_SERVICE_ROLE_KEY`) und löscht nur Namen, die dem Muster der Foto-Ordner entsprechen.

## Betrachtete Optionen

### Abruf fremder Adressen

#### Option A — Gemeinsamer Baustein mit DNS-Prüfung vor jedem Hop (gewählt)

- **Pro:** eine geprüfte Stelle für Bild und Rezeptseite; Tests je Adressklasse; keine weitere
  Infrastruktur; die Optionen decken beide Fälle ab.
- **Contra:** DNS-Rebinding bleibt als Restrisiko: `fetch` löst den Namen selbst noch einmal auf,
  die Edge Runtime kann die Verbindung nicht an die geprüfte Adresse binden. Ein Angreifer mit
  eigener Domain und sehr kurzer TTL könnte zwischen Prüfung und Abruf umschalten. Entschärft:
  nur Port 443 mit TLS — das Zertifikat eines internen Ziels passt nicht zum Namen des
  Angreifers, also geht keine HTTP-Anfrage hinaus, und eine Antwort ohne Bildsignatur käme nicht
  durch; übrig bleibt ein blinder Test, ob intern Port 443 antwortet. Scheitert eine der beiden
  DNS-Abfragen anders als mit „keine Einträge“, wird nicht abgerufen.

#### Option B — Abruf im Browser

- **Pro:** kein Server-Code, kein SSRF.
- **Contra:** scheitert an CORS bei den meisten Bild-Hosts und bei jeder Rezeptseite; genau das,
  was Enrico heute stört („erst herunterladen“).

#### Option C — Feste Liste erlaubter Hosts (wie `resolve-maps-link`)

- **Pro:** kein Rebinding-Risiko, sehr kleine Angriffsfläche.
- **Contra:** Bilder und Rezepte kommen von beliebigen Seiten; eine Liste wäre nie vollständig.

#### Option D — Eigener Abruf-Dienst mit Egress-Filter (z. B. Azure Container App)

- **Pro:** Rebinding lässt sich auf Netzebene ausschließen.
- **Contra:** eigener Dienst mit Betrieb und Kosten entgegen ADR-0007, für zwei Funktionen eines
  Haushalts.

### Bildmodell

#### Option A — FLUX.2-pro über den BFL-Pfad von Foundry (gewählt)

- **Pro:** im Projekt bereitgestellt und produktiv erprobt (Skill `recipe-crud`), Bearbeiten mit
  `input_image`, ein Anbieter wie ADR-0009.
- **Contra:** eigener Pfad statt `/openai/v1`, also ein zweiter kleiner Client; Vorschau-API
  (`api-version=preview`) kann sich ändern.

#### Option B — `/openai/v1/images/generations` von Foundry

- **Pro:** gleicher Client-Stil wie das LLM.
- **Contra:** Bearbeiten ist dort nur für ein anderes Modell dokumentiert; nicht erprobt.

### Aufräumen

#### Option A — `pg_cron` + Funktion mit `p_now` + signierter Aufruf einer Edge Function (gewählt)

- **Pro:** die Datenbank kennt alle Verweise und entscheidet in einer testbaren Funktion (pgTAP
  mit `p_now`); gleiches Muster wie die Benachrichtigungen (ADR-0014); Löschen korrekt über die
  Storage-API.
- **Contra:** eine Funktion braucht den Server-Schlüssel; ein weiteres Geheimnis (Function-Secret
  und Vault) muss gesetzt werden, sonst läuft der Job ohne Wirkung.

#### Option B — Aufräumen in der App

- **Pro:** kein Server-Schlüssel.
- **Contra:** läuft nur, wenn jemand die App öffnet, sieht nur die eigenen Haushalte und ist genau
  der Weg, der heute abbricht.

## Begründung

Für den Abruf entscheidet, dass beliebige Adressen funktionieren müssen (B und C fallen weg) ohne
neue Infrastruktur (D fällt weg); das Rebinding-Restrisiko ist bei einer App für einen Haushalt
mit Einladung und Anmeldung tragbar, weil ein Angreifer ein Mitglied sein müsste. Beim Bildmodell
entscheidet, dass der Weg erprobt ist. Beim Aufräumen, dass nur die Datenbank alle Verweise kennt.

## Konsequenzen

**Positiv:** Bilder per Adresse ohne Umweg; Spec 0040 baut den Rezept-Link-Abruf auf einem
getesteten Baustein; verwaiste Fotos verschwinden nachts.

**Negativ:** DNS-Rebinding bleibt Restrisiko (siehe Option A); `media-sweep` hält den
Server-Schlüssel und darf deshalb nur signierte Aufrufe mit Namen der Foto-Ordner annehmen; ohne
gesetztes `MEDIA_SWEEP_SECRET` (Function-Secret) und die Vault-Einträge `media_sweep_url` /
`media_sweep_secret` räumt niemand auf (Warnung `media_sweep_not_configured`). Kein Kontingent
für `fetch-image`: ein Mitglied könnte den Server viele Bilder laden lassen.

**Folgearbeiten:** Geheimnis und Vault-Einträge setzt Enrico (Liste „Enricos Todos“); Spec 0040
ergänzt den Bild-Client und nutzt `fetchPublic` für Rezeptseiten.

## Wann diese Entscheidung neu bewertet wird

Wenn die Edge Runtime erlaubt, die Verbindung an eine geprüfte Adresse zu binden (dann Rebinding
schließen); wenn die App mehr als einen Haushalt ohne Einladung bedient; wenn `fetch-image`
missbraucht wird (dann Kontingent); wenn FLUX.2-pro in Foundry entfällt oder die BFL-Vorschau-API
bricht.
