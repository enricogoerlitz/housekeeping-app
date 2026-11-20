# Architekturentscheidungen (ADR)

Warum etwas so gebaut ist und wogegen es abgewogen wurde. Neue ADRs entstehen mit dem
`adr`-Skill aus `0000-template.md`. Angenommene ADRs werden nie umgeschrieben, sondern durch
neue abgelöst.

| Nr.                                                    | Entscheidung                                                            | Status              |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------- |
| [0001](0001-plattform-und-app-technologie.md)          | Expo Universal-App für iOS, iPadOS, Android und Web                     | angenommen          |
| [0002](0002-offline-faehigkeit-und-synchronisation.md) | Offline-first mit PowerSync, Supabase als Quelle der Wahrheit           | abgelöst durch 0008 |
| [0003](0003-anmeldung-und-zugang.md)                   | Google- und Apple-Login, nur auf Einladung (Allowlist)                  | angenommen          |
| [0004](0004-mandantenfaehigkeit-ueber-haushalte.md)    | Haushalte als Mandanten, Row Level Security                             | angenommen          |
| [0005](0005-monorepo-struktur.md)                      | Monorepo mit pnpm und Turborepo                                         | angenommen          |
| [0006](0006-ki-gestuetzte-arbeitsweise.md)             | Specs, Superpowers und kuratierte Skills                                | angenommen          |
| [0007](0007-hosting-und-kosten.md)                     | Free-Tiers, Skalierungspfad für mehrere Apps                            | angenommen          |
| [0008](0008-offline-lesen-mit-eigenem-delta-sync.md)   | Offline lesen mit eigenem Delta-Sync, online schreiben, offline abhaken | angenommen          |
| [0009](0009-ki-dienst.md)                              | KI über Microsoft Foundry, nur serverseitig aus Edge Functions          | angenommen          |
| [0010](0010-styling-und-themes.md)                     | Eigenes Theme-System statt NativeWind; drei Themes zur Laufzeit wählbar | angenommen          |
| [0011](0011-schreibweg-mit-lokaler-ueberlagerung.md)   | Schreibweg: lokal anwenden, eine RPC je Befehl, Überlagerung            | angenommen          |
