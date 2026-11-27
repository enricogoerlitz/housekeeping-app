# Architekturentscheidungen (ADR)

Warum etwas so gebaut ist und wogegen es abgewogen wurde. Neue ADRs entstehen mit dem
`adr`-Skill aus `0000-template.md`. Angenommene ADRs werden nie umgeschrieben, sondern durch
neue abgelöst.

| Nr.                                                                   | Entscheidung                                                                                        | Status              |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------- |
| [0001](0001-plattform-und-app-technologie.md)                         | Expo Universal-App für iOS, iPadOS, Android und Web                                                 | angenommen          |
| [0002](0002-offline-faehigkeit-und-synchronisation.md)                | Offline-first mit PowerSync, Supabase als Quelle der Wahrheit                                       | abgelöst durch 0008 |
| [0003](0003-anmeldung-und-zugang.md)                                  | Google- und Apple-Login, nur auf Einladung (Allowlist)                                              | angenommen          |
| [0004](0004-mandantenfaehigkeit-ueber-haushalte.md)                   | Haushalte als Mandanten, Row Level Security                                                         | angenommen          |
| [0005](0005-monorepo-struktur.md)                                     | Monorepo mit pnpm und Turborepo                                                                     | angenommen          |
| [0006](0006-ki-gestuetzte-arbeitsweise.md)                            | Specs, Superpowers und kuratierte Skills                                                            | angenommen          |
| [0007](0007-hosting-und-kosten.md)                                    | Free-Tiers, Skalierungspfad für mehrere Apps                                                        | angenommen          |
| [0008](0008-offline-lesen-mit-eigenem-delta-sync.md)                  | Offline lesen mit eigenem Delta-Sync, online schreiben, offline abhaken                             | angenommen          |
| [0009](0009-ki-dienst.md)                                             | KI über Microsoft Foundry, nur serverseitig aus Edge Functions                                      | angenommen          |
| [0010](0010-styling-und-themes.md)                                    | Eigenes Theme-System statt NativeWind; drei Themes zur Laufzeit wählbar                             | angenommen          |
| [0011](0011-schreibweg-mit-lokaler-ueberlagerung.md)                  | Schreibweg: lokal anwenden, eine RPC je Befehl, Überlagerung                                        | angenommen          |
| [0012](0012-neuaufbau-der-migrationen-vor-der-ersten-auslieferung.md) | Migrationen einmalig vor der ersten Auslieferung neu aufbauen                                       | angenommen          |
| [0013](0013-packen-ohne-netz.md)                                      | Packen ohne Netz über die Laden-Warteschlange, „Abhaken gewinnt“                                    | angenommen          |
| [0014](0014-zustellung-von-benachrichtigungen.md)                     | Web Push mit VAPID; die Datenbank plant, `push-send` stellt nur zu                                  | abgelöst durch 0017 |
| [0015](0015-auslieferung-und-betrieb.md)                              | Azure Static Web Apps, Vorschau aus `develop`, Kalender-Version, Mindestversion, Sicherung in Azure | angenommen          |
| [0016](0016-bildmodell-und-abruf-fremder-seiten.md)                   | Fremde Adressen nur über `fetch-public`, Bilder mit FLUX.2-pro, nächtliches Aufräumen der Fotos     | angenommen          |
| [0017](0017-mitteilungen-in-der-app.md)                               | Mitteilungen nur in der App (Glocke), Bestätigungen je Mitglied; Web Push entfällt                  | angenommen          |
