#!/usr/bin/env bash
# Local Firebase Emulator Suite (Auth, Firestore, Functions). Data persists in .emulator-data
# between runs; the first run starts empty (then `npm run emulators:seed`).
set -euo pipefail
cd "$(dirname "$0")/.."
DATA=.emulator-data
IMPORT=()
[[ -f "$DATA/firebase-export-metadata.json" ]] && IMPORT=(--import "$DATA")
exec firebase emulators:start --only auth,firestore,functions ${IMPORT[@]+"${IMPORT[@]}"} --export-on-exit "$DATA"
