#!/usr/bin/env bash
# Copy config/app (TMDB key, minVersion, lastCatalogSync) from production into the running
# Firestore emulator — the only doc signed-in clients need before they work. 1 production read.
# Needs: `firebase emulators:start` running, gcloud signed in as a project owner.
set -euo pipefail
PROJECT="${PROJECT:-tv-time-returns}"
ACCOUNT="${GCLOUD_ACCOUNT:-nolangoku@gmail.com}"
EMULATOR="${FIRESTORE_EMULATOR_HOST:-127.0.0.1:8080}"
DOC="projects/$PROJECT/databases/(default)/documents/config/app"

TOKEN=$(gcloud auth print-access-token --account="$ACCOUNT")
BODY=$(curl -sf -H "Authorization: Bearer $TOKEN" "https://firestore.googleapis.com/v1/$DOC" |
	python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({"fields": d["fields"]}))')
curl -sf -X PATCH -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
	-d "$BODY" "http://$EMULATOR/v1/$DOC" >/dev/null
echo "Seeded config/app into the emulator at $EMULATOR"
