#!/bin/bash
# Drive the booted iPhone simulator (needs idb: see .claude/skills/ui-verify/references/ios-simulator.md).
#   sim.sh tap X Y | swipe X1 Y1 X2 Y2 [seconds] | key CODE | url URL | shot NAME
# Coordinates are points (iPhone 18 Pro: 402x874). Screenshots go to $SIM_OUT (default tmp/ui-verify),
# plus a 900 px-high copy NAME-s.png that is cheap to read.
set -euo pipefail
UDID=${SIM_UDID:-$(xcrun simctl list devices booted | grep -m1 iPhone | grep -Eo '[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}')}
[ -n "$UDID" ] || { echo "no booted iPhone simulator" >&2; exit 1; }
OUT=${SIM_OUT:-tmp/ui-verify}
idb() { python3 -m idb.cli.main "$@" --udid "$UDID"; }
case "${1:-}" in
  tap) idb ui tap "$2" "$3" ;;
  swipe) idb ui swipe "$2" "$3" "$4" "$5" --duration "${6:-0.3}" ;;
  key) idb ui key "$2" ;;
  url) xcrun simctl openurl "$UDID" "$2" ;;
  shot) mkdir -p "$OUT"
    xcrun simctl io "$UDID" screenshot "$OUT/$2.png" >/dev/null 2>&1
    sips -Z 900 "$OUT/$2.png" --out "$OUT/$2-s.png" >/dev/null && echo "$OUT/$2-s.png" ;;
  *) echo "usage: sim.sh tap|swipe|key|url|shot ..." >&2; exit 2 ;;
esac
