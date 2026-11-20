---
status: angenommen
datum: 2026-11-20
autor: agent
betrifft: [0001]
---

# ADR-0010 — Styling und Themes

## Status

`angenommen`

## Kontext

Die App bekommt drei wählbare Themes („Markthalle“, „Klar“, „Frisch“), jedes in hell und dunkel.
Die Themes unterscheiden sich nicht nur in Farben: Sie haben eigene Schriften, Rundungen und einen
anderen Aufbau (feine Linien, gruppierte Karten oder farbige Kacheln). Das Theme wird zur Laufzeit
gewechselt und lokal gespeichert. Der Code läuft im Web und später nativ (ADR-0001). Die App nutzt
Expo SDK 58 mit React Native 0.88 und dem React Compiler.

## Entscheidung

Wir bauen ein **eigenes, typisiertes Theme-System** in `packages/ui`: Jedes Theme ist ein
TypeScript-Objekt mit Farben, Schrift-Stilen, Radien und Aufbau-Varianten. Ein `ThemeProvider`
stellt es bereit, Bausteine lesen es über `useTheme()` und gestalten sich mit dem `StyleSheet` von
React Native. Bildschirme verwenden nur diese Bausteine.

## Betrachtete Optionen

### Option A — Eigenes Theme-System mit `StyleSheet`

- **Pro:** keine zusätzliche Abhängigkeit, läuft im Web und nativ identisch. Vollständig
  typisiert. Wechsel zur Laufzeit ist ein Wechsel des Objekts. Aufbau-Varianten je Theme
  (z. B. Liste als Linien, Gruppe oder Kacheln) liegen an einer Stelle in den Bausteinen.
- **Contra:** keine Tailwind-Kurzschreibweise. Responsives Verhalten und Hover laufen über
  `useWindowDimensions` und `Pressable` statt über CSS.

### Option B — NativeWind (Tailwind für React Native)

- **Pro:** kurze Schreibweise, von KI sehr gut beherrscht, Themes über CSS-Variablen.
- **Contra:** Build-Abhängigkeit (Babel, Metro, Tailwind 3), deren Zusammenspiel mit Expo SDK 58,
  React Native 0.88 und dem React Compiler erst geprüft werden müsste. Aufbau-Unterschiede der
  Themes ließen sich nur mit Bedingungen in jedem Bildschirm abbilden.

### Option C — Tamagui oder Unistyles

- **Pro:** Themes und Varianten sind eingebaut, gute Performance.
- **Contra:** eigener Compiler bzw. native Module, höhere Einstiegshürde und dieselbe
  Kompatibilitätsfrage wie bei B.

## Begründung

Ausschlaggebend ist, dass **drei im Aufbau verschiedene Themes zur Laufzeit wechselbar** sein
müssen. Das ist mit einem Theme-Objekt und Bausteinen am einfachsten und ohne Build-Risiko.

## Konsequenzen

**Positiv:** Ein viertes Theme ist eine neue Datei. Bildschirme enthalten keine Farben und keine
Theme-Abfragen.

**Negativ:** Das Konzept nannte ursprünglich NativeWind; diese Entscheidung weicht davon ab.
Bausteine müssen jede Aufbau-Variante selbst umsetzen und im Showroom zeigen.

**Folgearbeiten:** Lint-Regel gegen Farbwerte außerhalb von `packages/ui`.

## Wann diese Entscheidung neu bewertet wird

Wenn das Schreiben von Bildschirmen spürbar umständlich wird oder ein Theme Dinge braucht, die das
Theme-Objekt nicht ausdrücken kann.
