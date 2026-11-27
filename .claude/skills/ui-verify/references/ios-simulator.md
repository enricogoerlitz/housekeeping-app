# iPhone simulator for the web app

Real iOS keyboard, Safari and gestures. Tested 27.11.2026: Xcode 27, iOS 27.2 simulator,
iPhone 18 Pro (402 x 874 pt, @3x), `idb`. Helpers live in `scripts/ios-sim/`; run them from the
repository root (screenshots go to `tmp/ui-verify/` unless `SIM_OUT` is set).

## One-time setup per machine

1. Xcode 27 with the iOS platform installed, Command Line Tools selected (`xcode-select -p`).
2. `brew trust facebook/fb && brew install idb-companion`
3. `pip install fb-idb`
4. Build the keyboard toggle (private CoreSimulator API, binary is not committed):
   `clang -fobjc-arc -framework Foundation scripts/ios-sim/hwkb.m -o tmp/ui-verify/hwkb`

## Start

- Boot an iPhone simulator and leave it booted (do not erase it): `xcrun simctl boot <UDID>`.
  The scripts auto-detect the booted iPhone; `SIM_UDID` overrides.
- Hardware keyboard off, so the software keyboard shows: `tmp/ui-verify/hwkb <UDID> 0`.
- Dev server from your own worktree on its own port, with dev login:
  `EXPO_PUBLIC_DEV_LOGIN=1 node scripts/with-env.mjs pnpm --filter @housekeeping/app exec expo start --web --port 8100`
  (needs the `.env` symlinked into the worktree; remove the symlink and stop the server afterwards).
- Open in Safari: `scripts/ios-sim/sim.sh url http://localhost:8100/`. Login: "Als Test-Enrico anmelden".
- Dark mode: `xcrun simctl ui <UDID> appearance dark|light`.

## Operate (`scripts/ios-sim/sim.sh`, points not pixels)

| Command | Effect |
| --- | --- |
| `sim.sh tap X Y` | tap |
| `sim.sh swipe X1 Y1 X2 Y2 [s]` | swipe; 0.2 s = fling, 0.6 s+ = slow drag |
| `sim.sh key CODE` | HID key |
| `sim.sh url URL` | open URL in Safari |
| `sim.sh shot NAME` | screenshot plus a 900 px-high `NAME-s.png` (read this one) |
| `python3 -m idb.cli.main ui describe-all --udid <UDID>` | native accessibility elements (Safari bars, share sheet) |

Points vs pixels: the 900 px copy maps to 874 pt, so pt = px x 0.971. Web content is not in the
accessibility tree: read targets off the screenshot and convert.

## Typing

Never use `idb ui text` when the software keyboard is under test: it switches the simulator to
the hardware keyboard (the keyboard disappears, `visualViewport` no longer changes). Use
`python3 scripts/ios-sim/kb.py "Text"` instead; it taps the German QWERTZ keys (capitals via
shift, digits via "123"). Key positions assume 402 x 874. If the hardware keyboard got switched
on, run `hwkb <UDID> 0`.

The keyboard accessory bar (prev, next, done) sits near y = 527 pt only while the keyboard is open,
and moves by about 27 pt with the keyboard type. Look at a screenshot first: without a keyboard the
same point hits a page element. iOS offers prev/next only for fields that were visible on focus.

## Installed PWA (home screen)

Safari: address bar menu (115, 815) -> Share -> "More" -> "Add to Home Screen" -> keep "Open as Web
App" on -> Add. Tap the icon on the home screen. It has its own login and storage, a taller window
(812 pt, no Safari bars; keyboard leaves 416-447 pt instead of 384) and no address-bar scroll
offset. Cold start: `xcrun simctl terminate <UDID> com.apple.webapp`, then tap the icon. Check
findings in both Safari and PWA mode.

## Timing, to catch jumps

Screenshot 0.15-0.4 s after an action (catches mid-motion jumps; sheets slide ~250 ms, keyboard
~250 ms) and again after 1.2-1.5 s (final state). After a code change Fast Refresh reloads in about
3 s and drops open keyboards and sheets: recreate the state. Use `sleep` only between simulator
actions; wait for CI with `until ...; do sleep 15; done`.

## Measure instead of guess

Screenshots cannot prove a jump. Put a throwaway script into `apps/app/public/` (and a script tag
in `index.html`) that posts one line per `visualViewport` resize/scroll, focus, `touchend` and
changed frame to a tiny local receiver (log only, no eval or remote-control channel): `scrollY`,
`visualViewport.offsetTop/height`, `--app-height`, active element. Clear the log before each
step. Never commit the script or the `index.html` change.

## Limits

- `safaridriver` does not work with the iOS 27 simulator; no WebDriver, no DOM access.
- Web content is not in the accessibility tree.
- A second dev server on another port cannot call edge functions: local CORS only allows the
  ports in `ALLOWED_ORIGINS` in `supabase/config.toml`. Use an allowed port or add yours locally.
- No real gesture feel or haptics, no camera or photo library with real images; check launch
  images (`apple-touch-startup-image`) on a real iPhone (cold start showed ~1 s black).
- Web search and AI features need keys that may be missing locally ("nicht erreichbar").
- The local database is shared: reset nothing, delete what you created, undo accidental favourites
  or ticks and name them in the report.
