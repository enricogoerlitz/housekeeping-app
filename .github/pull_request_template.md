## Worum geht es

<!-- Ein bis drei Sätze: was ändert sich und warum. Titel als Conventional Commit, z. B. „feat: Reisetaschen“. -->

Spec: NNNN

<!-- Ohne Spec: die Zeile oben ersetzen durch „ohne Spec, weil …“ (z. B. Refactoring mit grünen Tests, Abhängigkeits-Update, Tippfehler). -->

## Tests

<!-- Neue oder geänderte Tests (mit AC-Nummer) und was lokal lief, z. B. `pnpm format:check && pnpm check`. -->

## Kritischer Pfad

<!-- Nur, wenn die PR Anmeldung, RLS und Mandanten, Delta-Sync oder die Laden-Warteschlange, Migrationen, das Löschen von Daten oder Infrastruktur berührt. Sonst den Abschnitt löschen. -->

- [ ] Bedrohungsmodell im `plan.md` (Risiken und Gegenmaßnahmen)
- [ ] Negativtests: fremder Haushalt, abgemeldet, ungültige Eingabe, Fehlerfall
- [ ] `/security-check` über den Diff gelaufen, Befunde behoben oder im `plan.md` vermerkt
