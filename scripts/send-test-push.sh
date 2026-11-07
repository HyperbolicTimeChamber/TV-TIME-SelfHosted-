#!/usr/bin/env bash
# Sends the update notification to a phone, to test it after a release (Cloud Function sendTestPush).
# Usage: TEST_PUSH_KEY=… scripts/send-test-push.sh [email] [prod|dev]
#   email  — that account's phone (the one signed in on it); omit to send to the whole channel
#   channel — prod (default) or dev (staging builds)
# The key is the TEST_PUSH_KEY secret (firebase functions:secrets:access TEST_PUSH_KEY).
set -euo pipefail
: "${TEST_PUSH_KEY:?Set TEST_PUSH_KEY (firebase functions:secrets:access TEST_PUSH_KEY)}"
EMAIL="${1:-}"
CHANNEL="${2:-prod}"
PROJECT=$(node -p "require('./.firebaserc').projects.default")
URL="${TEST_PUSH_URL:-https://us-central1-${PROJECT}.cloudfunctions.net/sendTestPush}"
BODY=$(node -e 'const [email, channel] = process.argv.slice(1); console.log(JSON.stringify(email ? { email, channel } : { channel }))' "$EMAIL" "$CHANNEL")
curl -sS -X POST "$URL" -H "Content-Type: application/json" -H "x-test-push-key: ${TEST_PUSH_KEY}" -d "$BODY"
echo
