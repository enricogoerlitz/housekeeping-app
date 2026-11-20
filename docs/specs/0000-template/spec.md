---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
datum: JJJJ-MM-TT
---

# NNNN — Feature-Titel

## Problem

Welches Problem wird für wen gelöst? Zwei bis vier Sätze aus Sicht der Nutzenden. Keine Lösung,
kein Technikbegriff.

## Ziel

Woran erkennt man, dass es gelöst ist? Beobachtbar formuliert.

## Nicht-Ziele

Was dieses Feature ausdrücklich **nicht** tut. Mindestens zwei Punkte.

- …
- …

## Anforderungen und Akzeptanzkriterien

### REQ-001 — Kurztitel

> Ein Satz, was gefordert ist.

**Offline:** offline vollständig · offline lesend · nur online — mit Begründung, wenn nicht
vollständig.

**AC-001**

```gherkin
Angenommen  <Ausgangszustand>
Wenn        <Handlung>
Dann        <beobachtbares Ergebnis>
```

**AC-002 — Rand- oder Fehlerfall**

```gherkin
Angenommen  <Ausgangszustand>
Wenn        <Handlung, die schiefgehen kann>
Dann        <definierte Reaktion>
```

### REQ-002 — …

## Offline und Konflikte

Was passiert, wenn zwei Geräte offline dasselbe ändern? Welche Regel aus
`docs/architecture/sync.md` greift? Was sieht man, solange etwas noch nicht synchronisiert ist?

## Plattformen

Besonderheiten für iPad, Web, Android (z. B. zweispaltig, Zurück-Taste, Tastaturkürzel).

## Daten

Welche Daten werden gelesen, geschrieben, gelöscht? Personenbezogene Daten?

## Offene Fragen

| #   | Frage | Optionen    | Empfehlung | Status                           |
| --- | ----- | ----------- | ---------- | -------------------------------- |
| 1   | …     | A: … / B: … | A, weil …  | OFFEN · BLOCKER · ENTSCHIEDEN: … |

## Rückverfolgbarkeit

| REQ     | AC             | Task (plan.md) | Test |
| ------- | -------------- | -------------- | ---- |
| REQ-001 | AC-001, AC-002 | —              | —    |
