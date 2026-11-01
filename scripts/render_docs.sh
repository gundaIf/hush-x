#!/bin/sh
# Renders docs/og.png (social preview) and the popup screenshots with a headless Chromium.
# Usage: scripts/render_docs.sh [path-to-chromium-binary]
set -e
cd "$(dirname "$0")/.."
BROWSER="${1:-/Applications/Brave Browser.app/Contents/MacOS/Brave Browser}"
shot() { # out width height url [extra flags]
  out="$1"; w="$2"; h="$3"; url="$4"; shift 4
  "$BROWSER" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size="$w,$h" --screenshot="$PWD/$out" "$@" "$url" >/dev/null 2>&1
  echo "$out"
}
shot docs/og.png 1280 640 "file://$PWD/docs/og.html"
shot docs/popup-dark.png 600 500 "file://$PWD/popup/popup.html" --force-dark-mode
shot docs/popup-light.png 600 500 "file://$PWD/popup/popup.html"
