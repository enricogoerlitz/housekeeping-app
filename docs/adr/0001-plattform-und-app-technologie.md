---
status: angenommen
datum: 2026-11-20
autor: agent
betrifft: []
---

# ADR-0001 — Plattform und App-Technologie

## Status

`angenommen`

## Kontext

Die App muss auf iPhone, iPad, Android und im Browser laufen, mit einem Design, das sich auf dem
Handy nativ anfühlt (Tab-Leiste, Sheets, Haptik, Wischgesten). Sie wird überwiegend mit KI
entwickelt. Entwicklungszeit und Vorkenntnisse sind deshalb kein Kriterium, Konsistenz über alle
Plattformen dagegen schon. Die App muss vollständig offline funktionieren (ADR-0002).

## Entscheidung

Wir bauen eine Universal-App mit **Expo (React Native, SDK 58) und Expo Router**. Eine Codebasis
läuft auf iOS, iPadOS, Android und im Web.

## Betrachtete Optionen

### Option A — Expo Universal-App

- **Pro:** eine Codebasis und ein Testsatz. Echte native Komponenten (Liquid-Glass-Tab-Leiste,
  SF Symbols, Haptik). Web-Build aus demselben Code. Over-the-Air-Updates. Offizielle
  Agent-Skills von Expo.
- **Contra:** Das Web fühlt sich etwas „app-artig“ an. Native Builds brauchen Xcode bzw. Android
  SDK oder EAS Build.

### Option B — SwiftUI (iOS) + Kotlin (Android) + React (Web)

- **Pro:** maximal nativ.
- **Contra:** drei UIs und drei Testwelten. Funktionen laufen auseinander. Sync-Logik dreifach.

### Option C — Reine PWA

- **Pro:** kein App-Store, keine Apple-Gebühr.
- **Contra:** Auf iOS fehlen native Tab-Leiste, Haptik und Widgets, und der Speicher kann vom
  System geleert werden. Das ist für Offline-Daten riskant.

### Option D — Capacitor (Web-App in nativer Hülle)

- **Pro:** schneller Start mit reinem Web-Stack.
- **Contra:** fühlt sich nie ganz nativ an; Gesten und Animationen schwächer.

## Begründung

Den Ausschlag gibt **eine Codebasis für vier Plattformen bei nativem Gefühl**. Option B
verdreifacht die Arbeit an der kritischsten Stelle, Sync und Offline. Option C scheitert an der
Offline-Zuverlässigkeit auf iOS.

## Konsequenzen

**Positiv:** Funktionen erscheinen überall gleichzeitig. Das Web dient als schneller Testkanal
und für Screenshots (`ui-verify`).

**Negativ:** Native Module wie PowerSync und Google-Login laufen nicht in Expo Go. Wir brauchen
**Development Builds**: lokal (Xcode / Android Studio) oder über EAS Build. Auf einem echten
iPhone setzt das den Apple-Developer-Account voraus (ADR-0007).

**Folgearbeiten:** Xcode und Android Studio lokal installieren, oder EAS Build einrichten. Das
passiert mit der ersten Spec, die native Module braucht.

## Wann diese Entscheidung neu bewertet wird

Wenn eine Kernfunktion nur nativ sinnvoll umsetzbar ist und Expo-Module nicht reichen, z. B. ein
tief integriertes Widget-Erlebnis.
