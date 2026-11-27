#!/usr/bin/env python3
"""Type text by tapping the iOS German software keyboard.

`idb ui text` would switch the simulator to the hardware keyboard, which hides the keyboard
we want to test. Usage: kb.py "Text"  (letters, space, digits, '-'; capitals use shift).
Key positions are screenshot pixels of an iPhone 18 Pro (402x874 pt, @3x, 900 px-high copy).
Set SIM_UDID to override the auto-detected booted iPhone.
"""
import os, re, subprocess, sys, time

def booted_udid():
    out = subprocess.run(['xcrun', 'simctl', 'list', 'devices', 'booted'],
                         capture_output=True, text=True, check=True).stdout
    m = re.search(r'iPhone.*?\(([0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12})\)', out)
    if not m: sys.exit('no booted iPhone simulator')
    return m.group(1)

UDID = os.environ.get('SIM_UDID') or booted_udid()
PX_TO_PT = 0.971  # 900 px screenshot -> 874 pt

def tap(x_px, y_px):
    subprocess.run(['python3', '-m', 'idb.cli.main', 'ui', 'tap', str(round(x_px * PX_TO_PT)),
                    str(round(y_px * PX_TO_PT)), '--udid', UDID], check=True)
    time.sleep(0.12)

pos = {}
for y, keys in {636: 'qwertzuiopü', 692: 'asdfghjklöä'}.items():
    for i, k in enumerate(keys): pos[k] = (22 + 37 * i, y)
for i, k in enumerate('yxcvbnm'): pos[k] = (96 + 37 * i, 748)
pos[' '] = (207, 803)
DIGITS = '1234567890'
for i, k in enumerate(DIGITS): pos['#' + k] = (22 + 40.6 * i, 636)
pos['#-'] = (22, 692)
SHIFT, NUMBERS = (30, 748), (55, 803)  # shift key; "123" / "ABC" toggle

for ch in sys.argv[1]:
    if ch in DIGITS or ch == '-':
        tap(*NUMBERS); tap(*pos['#' + ch]); tap(*NUMBERS)
    elif ch.lower() in pos:
        if ch.isupper(): tap(*SHIFT)
        tap(*pos[ch.lower()])
    else:
        print('skip', ch)
