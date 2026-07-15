#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/bump-version.sh [--minor|--major]
# Default: patch bump
# Outputs new version string to stdout

BUMP_TYPE="patch"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --minor) BUMP_TYPE="minor"; shift ;;
    --major) BUMP_TYPE="major"; shift ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

APP_JSON="app/app.json"
PKG_JSON="app/package.json"

# Read current version from app.json
CURRENT_VERSION=$(grep -o '"version": "[^"]*"' "$APP_JSON" | head -1 | cut -d'"' -f4)
CURRENT_VERSION_CODE=$(grep -o '"versionCode": [0-9]*' "$APP_JSON" | head -1 | grep -o '[0-9]*')

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
NEW_VERSION_CODE=$((CURRENT_VERSION_CODE + 1))

# Update app.json — version string
sed -i.bak "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" "$APP_JSON"
# Update app.json — versionCode
sed -i.bak "s/\"versionCode\": ${CURRENT_VERSION_CODE}/\"versionCode\": ${NEW_VERSION_CODE}/" "$APP_JSON"
rm -f "${APP_JSON}.bak"

# Update package.json
sed -i.bak "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" "$PKG_JSON"
rm -f "${PKG_JSON}.bak"

echo "$NEW_VERSION"
