#!/usr/bin/env bash
# Assembles loadable extension directories (and zips) for Chrome and Firefox.
#
# Shared code lives in src/ and icons/; each browser only has its own
# manifest.json. Output:
#   dist/chrome/   - load via chrome://extensions ("Load unpacked")
#   dist/firefox/  - load via about:debugging ("Load Temporary Add-on")
#   dist/log-colorizer-chrome.zip / dist/log-colorizer-firefox.zip
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist
for browser in chrome firefox; do
  out="dist/$browser"
  mkdir -p "$out/icons"
  cp "$browser/manifest.json" "$out/"
  cp src/background.js src/colorize.js "$out/"
  cp icons/*.png "$out/icons/"
  (cd "$out" && zip -qr "../log-colorizer-$browser.zip" .)
  echo "built $out and dist/log-colorizer-$browser.zip"
done
