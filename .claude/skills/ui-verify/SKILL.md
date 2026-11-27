---
name: ui-verify
description: Look at the real UI before calling UI work done - desktop in the browser (Playwright), mobile in the iPhone simulator, in light and dark mode, checked against DESIGN.md and a fixed checklist. Use after building or changing a screen or component, when asked how something looks, or before an impeccable critique.
argument-hint: "[route, e.g. /rezepte]"
---

# UI verify

Code that compiles can still look broken. This skill gives the agent eyes: it produces
screenshots, reads them, and reports what is wrong. It does not change code.

## Where to check what

| Target | Tool |
| --- | --- |
| Desktop | Playwright/Chromium 1440x900 (tablet 820x1180 optional) |
| Mobile (real iOS keyboard, Safari, gestures) | iPhone simulator, see `references/ios-simulator.md` |
| Android proxy (Nadja uses Android) | light Playwright phone-viewport pass (390x844), main flows only |

The automated e2e suite keeps its phone viewport. Use the simulator for anything keyboard-,
viewport- or gesture-related; Chromium cannot show those.

## 1. Build and serve the web app

```bash
pnpm build:web
python3 -m http.server 8099 --directory apps/app/dist   # run in background
```

The export is a single-page app, so deep links work only through client navigation. To capture a
route other than `/`, use the dev server instead (`pnpm web`, port 8081) and its URL.

## 2. Screenshot the web build

Into `tmp/ui-verify/<YYYYMMDD-HHMMSS>/` (git-ignored). First run on a machine needs
`npx playwright install chromium`.

```bash
OUT=tmp/ui-verify/$(date +%Y%m%d-%H%M%S); mkdir -p "$OUT"; URL=http://localhost:8099
for scheme in light dark; do
  npx playwright screenshot --viewport-size=390,844   --color-scheme=$scheme --wait-for-timeout=1500 $URL "$OUT/phone-$scheme.png"
  npx playwright screenshot --viewport-size=820,1180  --color-scheme=$scheme --wait-for-timeout=1500 $URL "$OUT/tablet-$scheme.png"
  npx playwright screenshot --viewport-size=1440,900  --color-scheme=$scheme --wait-for-timeout=1500 $URL "$OUT/desktop-$scheme.png"
done
```

Add `--full-page` for long screens. Stop the server afterwards.

## 3. iPhone simulator

Setup, helpers (`scripts/ios-sim/`), typing, PWA mode and limits are in
`references/ios-simulator.md`; read it before the first simulator run. Screenshots go to the same
`tmp/ui-verify/` folder. Android emulator: `adb exec-out screencap -p > "$OUT/android.png"`.

Web screenshots do not show native-only behaviour (Liquid Glass, haptics). Say so when the
simulator was not used.

## 4. Look at every screenshot

Open each image and check:

| Check | Looks for |
| --- | --- |
| Design | Matches `docs/design/DESIGN.md`: tokens, type scale, spacing rhythm, one accent |
| Layout per size | Phone single column; tablet and desktop use the width (no stretched phone layout) |
| Dark mode | No invisible text, no pure-white surfaces, sufficient contrast |
| Text | No truncation of important text, no overflow, German umlauts render |
| Touch | Targets visibly ≥ 44 pt, primary action within thumb reach on phone |
| States | Empty, offline and "syncing" states designed, not blank |
| Safe areas | Nothing under the notch, home indicator or browser chrome |

## 5. Report

In German: a table per screenshot with findings and severity (`kaputt`, `unschön`, `Detail`),
the path to the screenshot folder, and what could not be checked. Then suggest `impeccable`
critique for a deeper design review, or `review-animations` if motion changed.

## Do not

- Do not call UI work done without having opened the screenshots.
- Do not fix findings inside this skill. Report first; fixing is the next step.
- Do not commit screenshots.
