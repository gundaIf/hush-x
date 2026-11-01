#!/bin/sh
# Builds dist/hush-x-v<version>.zip with only the files Chrome needs to load the extension.
set -e
cd "$(dirname "$0")/.."
VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
OUT="dist/hush-x-v$VERSION.zip"
mkdir -p dist
rm -f "$OUT"
zip -qr -X "$OUT" manifest.json src popup icons LICENSE -x '*.DS_Store'
echo "$OUT"
