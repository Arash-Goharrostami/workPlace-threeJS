#!/usr/bin/env bash
# Copies the one Stockfish build the chess set needs into public/stockfish/.
# Usage: import-stockfish.sh            (or `npm run stockfish`)
#
# The `stockfish` npm package is 161 MB — six builds, two of them carrying the full
# 99 MB network — and the room wants one: the *lite, single-threaded* one, whose small
# NNUE is 1.8 MB and which runs without SharedArrayBuffer, so it needs none of the
# COOP/COEP headers GitHub Pages cannot send. So this is not a dependency; the package
# is fetched once with `npm pack`, the two files lifted out and the tarball dropped.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
version="19.0.0"
build="stockfish-19-lite-single"
out="$root/public/stockfish"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

(cd "$tmp" && npm pack "stockfish@$version" --silent >/dev/null)
tar -xzf "$tmp"/stockfish-*.tgz -C "$tmp" "package/bin/$build.js" "package/bin/$build.wasm"

mkdir -p "$out"
cp "$tmp/package/bin/$build.js" "$tmp/package/bin/$build.wasm" "$out/"
echo "Done: $out/$build.{js,wasm} ($(du -ch "$out/$build".* | tail -1 | cut -f1))"
