#!/usr/bin/env bash
set -euo pipefail

# Bumps versionCode (Android) and buildNumber (iOS) without changing version string.
# Usage: ./scripts/bump-build.sh

APP_JSON="app/app.json"

CURRENT_CODE=$(grep -o '"versionCode": [0-9]*' "$APP_JSON" | head -1 | grep -o '[0-9]*')
NEW_CODE=$((CURRENT_CODE + 1))

# Android versionCode
sed -i.bak "s/\"versionCode\": ${CURRENT_CODE}/\"versionCode\": ${NEW_CODE}/" "$APP_JSON"

# iOS buildNumber
CURRENT_BUILD=$(grep -o '"buildNumber": "[^"]*"' "$APP_JSON" | head -1 | cut -d'"' -f4)
sed -i.bak "s/\"buildNumber\": \"${CURRENT_BUILD}\"/\"buildNumber\": \"${NEW_CODE}\"/" "$APP_JSON"

rm -f "${APP_JSON}.bak"

echo "$NEW_CODE"
