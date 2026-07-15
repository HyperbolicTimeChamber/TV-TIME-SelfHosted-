# CI/CD Pipeline, Forced Update & Auto-Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-version the app on push to main, build AAB with Fastlane on GitHub Actions, deploy to Google Play internal testing, and check for forced/flexible updates on app launch via Google's In-App Updates API.

**Architecture:** Version bump script updates `app.json` + `package.json` on push to `main`. GitHub Actions workflow runs `expo prebuild` → Fastlane Gradle build → Fastlane `supply` to Play Store internal track. On PR to `main`, same build+deploy without version bump. App-side, `useForceUpdate` hook reads Firestore `config/app.minVersion` and uses `sp-react-native-in-app-updates` to trigger immediate or flexible update.

**Tech Stack:** GitHub Actions, Fastlane, Expo 57, sp-react-native-in-app-updates, Firebase Firestore, bash

## Global Constraints

- Package name: `com.tvtimerevived.app`
- Expo SDK 57, React Native 0.86
- RNFirebase v25 modular API
- Node 20+ on CI
- Ruby 3.x for Fastlane
- Fastlane files at `app/fastlane/` (not inside generated `android/`)
- All secrets stored as GitHub repository secrets

---

### Task 1: Version Bump Script

**Files:**
- Create: `scripts/bump-version.sh`
- Modify: `app/app.json` (add `versionCode`)

**Interfaces:**
- Consumes: nothing
- Produces: `scripts/bump-version.sh` — accepts `--minor` or `--major` flag, outputs new version string to stdout, updates `app/app.json` and `app/package.json` in-place

- [ ] **Step 1: Add `versionCode` to `app/app.json`**

Edit `app/app.json` — add `versionCode: 1` inside `expo.android`:

```json
{
  "expo": {
    "version": "1.0.0",
    "android": {
      "versionCode": 1,
      "googleServicesFile": "./google-services.json",
      "adaptiveIcon": {
        "backgroundColor": "#0D0D0D",
        "foregroundImage": "./assets/icon-foreground.png"
      },
      "predictiveBackGestureEnabled": false,
      "package": "com.tvtimerevived.app"
    }
  }
}
```

- [ ] **Step 2: Create `scripts/bump-version.sh`**

```bash
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
```

- [ ] **Step 3: Make script executable and test locally**

Run:
```bash
chmod +x scripts/bump-version.sh
```

Verify current version:
```bash
grep '"version"' app/app.json
# Expected: "version": "1.0.0"
```

Test patch bump (dry run — revert after):
```bash
./scripts/bump-version.sh
# Expected output: 1.0.1
grep '"version"' app/app.json
# Expected: "version": "1.0.1"
grep '"versionCode"' app/app.json
# Expected: "versionCode": 2
git checkout app/app.json app/package.json
```

Test minor bump:
```bash
./scripts/bump-version.sh --minor
# Expected output: 1.1.0
git checkout app/app.json app/package.json
```

Test major bump:
```bash
./scripts/bump-version.sh --major
# Expected output: 2.0.0
git checkout app/app.json app/package.json
```

- [ ] **Step 4: Commit**

```bash
git add scripts/bump-version.sh app/app.json
git commit -m "feat: add version bump script and versionCode to app.json"
```

---

### Task 2: Fastlane Configuration

**Files:**
- Create: `app/fastlane/Appfile`
- Create: `app/fastlane/Fastfile`
- Create: `app/Gemfile`

**Interfaces:**
- Consumes: signed keystore at path from env vars, service account JSON at path from env var
- Produces: Fastlane lanes `build` (outputs AAB) and `deploy` (builds + uploads to internal track)

- [ ] **Step 1: Create `app/Gemfile`**

```ruby
source "https://rubygems.org"

gem "fastlane"
```

- [ ] **Step 2: Create `app/fastlane/Appfile`**

```ruby
json_key_file(ENV["PLAY_SERVICE_ACCOUNT_JSON_PATH"])
package_name("com.tvtimerevived.app")
```

- [ ] **Step 3: Create `app/fastlane/Fastfile`**

```ruby
default_platform(:android)

platform :android do
  desc "Build release AAB"
  lane :build do
    gradle(
      project_dir: "./android",
      task: "bundle",
      build_type: "Release",
      properties: {
        "android.injected.signing.store.file" => ENV["KEYSTORE_PATH"],
        "android.injected.signing.store.password" => ENV["KEYSTORE_PASSWORD"],
        "android.injected.signing.key.alias" => ENV["KEY_ALIAS"],
        "android.injected.signing.key.password" => ENV["KEY_PASSWORD"],
      }
    )
  end

  desc "Build and deploy to internal testing"
  lane :deploy do
    build
    supply(
      track: "internal",
      aab: "./android/app/build/outputs/bundle/release/app-release.aab",
      skip_upload_metadata: true,
      skip_upload_changelogs: true,
      skip_upload_images: true,
      skip_upload_screenshots: true,
    )
  end
end
```

- [ ] **Step 4: Commit**

```bash
git add app/Gemfile app/fastlane/Appfile app/fastlane/Fastfile
git commit -m "feat: add Fastlane config for Android build and Play Store deploy"
```

---

### Task 3: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `scripts/bump-version.sh`, Fastlane lanes from Task 2
- Produces: automated build+deploy on PR and push to `main`

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Build & Deploy to Play Store

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-deploy:
    if: "!contains(github.event.head_commit.message, '[skip ci]')"
    runs-on: ubuntu-latest
    timeout-minutes: 45

    steps:
      # ── Checkout ──
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          fetch-depth: 0

      # ── Version Bump (push only) ──
      - name: Detect bump flag
        if: github.event_name == 'push'
        id: bump
        run: |
          BUMP_FLAG=""
          # Check PR labels from merge commit
          PR_NUMBER=$(echo "${{ github.event.head_commit.message }}" | grep -oP '#\K[0-9]+' | head -1 || true)
          if [ -n "$PR_NUMBER" ]; then
            LABELS=$(gh pr view "$PR_NUMBER" --json labels --jq '.labels[].name' 2>/dev/null || true)
            if echo "$LABELS" | grep -q "bump:major"; then
              BUMP_FLAG="--major"
            elif echo "$LABELS" | grep -q "bump:minor"; then
              BUMP_FLAG="--minor"
            fi
          fi
          # Fallback to commit message flags
          if [ -z "$BUMP_FLAG" ]; then
            if echo "${{ github.event.head_commit.message }}" | grep -qi '\[major\]'; then
              BUMP_FLAG="--major"
            elif echo "${{ github.event.head_commit.message }}" | grep -qi '\[minor\]'; then
              BUMP_FLAG="--minor"
            fi
          fi
          echo "flag=$BUMP_FLAG" >> "$GITHUB_OUTPUT"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Bump version
        if: github.event_name == 'push'
        id: version
        run: |
          chmod +x scripts/bump-version.sh
          NEW_VERSION=$(./scripts/bump-version.sh ${{ steps.bump.outputs.flag }})
          echo "new_version=$NEW_VERSION" >> "$GITHUB_OUTPUT"
          echo "Bumped to $NEW_VERSION"

      - name: Commit version bump
        if: github.event_name == 'push'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add app/app.json app/package.json
          git commit -m "chore: bump version to ${{ steps.version.outputs.new_version }} [skip ci]"
          git push

      # ── Node Setup + Cache ──
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: app/package-lock.json

      - name: Install dependencies
        run: npm ci
        working-directory: app

      # ── Expo Prebuild ──
      - name: Expo prebuild
        run: npx expo prebuild --platform android --clean
        working-directory: app

      # ── Ruby + Fastlane Setup ──
      - name: Setup Ruby
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: "3.3"
          bundler-cache: true
          working-directory: app

      # ── Gradle Cache ──
      - name: Cache Gradle
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: gradle-${{ runner.os }}-${{ hashFiles('app/android/**/*.gradle*', 'app/android/gradle/wrapper/gradle-wrapper.properties') }}
          restore-keys: |
            gradle-${{ runner.os }}-

      # ── Keystore ──
      - name: Decode keystore
        run: |
          echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 --decode > /tmp/release.keystore
        env:
          KEYSTORE_BASE64: ${{ secrets.KEYSTORE_BASE64 }}

      # ── Service Account ──
      - name: Write Play service account JSON
        run: echo '${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}' > /tmp/play-service-account.json

      # ── Build + Deploy ──
      - name: Fastlane deploy
        run: bundle exec fastlane android deploy
        working-directory: app
        env:
          KEYSTORE_PATH: /tmp/release.keystore
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
          PLAY_SERVICE_ACCOUNT_JSON_PATH: /tmp/play-service-account.json

      # ── Force Update (push only) ──
      - name: Update Firestore minVersion
        if: github.event_name == 'push' && contains(github.event.head_commit.message, '[force-update]')
        run: |
          echo '${{ secrets.FIREBASE_SERVICE_ACCOUNT_JSON }}' > /tmp/firebase-sa.json
          export GOOGLE_APPLICATION_CREDENTIALS=/tmp/firebase-sa.json
          npm install -g firebase-admin
          node -e "
            const admin = require('firebase-admin');
            admin.initializeApp();
            admin.firestore()
              .doc('config/app')
              .update({ minVersion: '${{ steps.version.outputs.new_version }}' })
              .then(() => { console.log('minVersion updated'); process.exit(0); })
              .catch(e => { console.error(e); process.exit(1); });
          "

      # ── PR Comment ──
      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const version = require('./app/app.json').expo.version;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `Build deployed to internal testing. Version: **${version}**`
            });
```

- [ ] **Step 2: Verify YAML syntax**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo "Valid YAML"
```
Expected: `Valid YAML`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: add GitHub Actions workflow for Play Store deployment"
```

---

### Task 4: In-App Force Update Hook

**Files:**
- Modify: `app/package.json` (add `sp-react-native-in-app-updates` dependency)
- Modify: `app/app.json` (add expo plugin if needed)
- Create: `app/src/hooks/useForceUpdate.ts`
- Modify: `app/src/stores/authStore.ts` (expose `minVersion` from config)
- Modify: `app/App.tsx` (call `useForceUpdate`)

**Interfaces:**
- Consumes: `authStore.minVersion` (string | null), `authStore.user` (User | null)
- Produces: `useForceUpdate()` hook — no return value, triggers native update UI on mount

- [ ] **Step 1: Install `sp-react-native-in-app-updates`**

Run:
```bash
cd app && npm install sp-react-native-in-app-updates
```

- [ ] **Step 2: Add `minVersion` to authStore**

Edit `app/src/stores/authStore.ts`:

Add to `AuthState` interface:
```typescript
  minVersion: string | null;
```

Add to initial state in `create<AuthState>`:
```typescript
  minVersion: null,
```

Update `loadAppConfig` to also read `minVersion`:
```typescript
  loadAppConfig: async () => {
    const timeout = setTimeout(() => {
      set({ appTmdbApiKeyLoading: false });
    }, 10000);
    try {
      const db = getFirestore();
      const configDoc = await getDoc(doc(db, "config", "app"));
      if (configDoc.exists()) {
        const data = configDoc.data();
        set({
          appTmdbApiKey: data?.tmdbApiKey ?? null,
          minVersion: data?.minVersion ?? null,
        });
      }
    } catch (error) {
      console.error("Failed to load app config:", error);
    } finally {
      clearTimeout(timeout);
      set({ appTmdbApiKeyLoading: false });
    }
  },
```

Update `signOut` to reset `minVersion`:
```typescript
  set({
    appTmdbApiKey: null,
    appTmdbApiKeyLoading: true,
    hasCompletedImport: false,
    minVersion: null,
  });
```

- [ ] **Step 3: Create `app/src/hooks/useForceUpdate.ts`**

```typescript
import { useEffect } from "react";
import { Alert, Platform } from "react-native";
import SpInAppUpdates, { IAUUpdateKind } from "sp-react-native-in-app-updates";
import { useAuthStore } from "../stores/authStore";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { expo } = require("../../app.json");
const appVersion: string = expo.version;

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const inAppUpdates = new SpInAppUpdates(false);

export function useForceUpdate() {
  const minVersion = useAuthStore((s) => s.minVersion);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (Platform.OS !== "android" || !user) return;

    const checkUpdate = async () => {
      try {
        const result = await inAppUpdates.checkNeedsUpdate();
        if (!result.shouldUpdate) return;

        const forceImmediate =
          minVersion != null && compareVersions(appVersion, minVersion) < 0;

        inAppUpdates.startUpdate({
          updateType: forceImmediate
            ? IAUUpdateKind.IMMEDIATE
            : IAUUpdateKind.FLEXIBLE,
        });
      } catch (error) {
        // Play Store not available (sideloaded) or other error
        if (minVersion != null && compareVersions(appVersion, minVersion) < 0) {
          Alert.alert(
            "Update Required",
            "Please update the app from the Google Play Store to continue.",
          );
        }
      }
    };

    checkUpdate();
  }, [minVersion, user]);
}
```

- [ ] **Step 4: Integrate in `app/App.tsx`**

Add import at top of file:
```typescript
import { useForceUpdate } from "./src/hooks/useForceUpdate";
```

Add hook call as first line inside `AppContent` function body:
```typescript
function AppContent() {
  useForceUpdate();
  const { user, loading, setUser, appTmdbApiKey, appTmdbApiKeyLoading, hasCompletedImport } =
    useAuthStore();
```

- [ ] **Step 5: Verify TypeScript compiles**

Run:
```bash
cd app && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add app/package.json app/package-lock.json app/src/hooks/useForceUpdate.ts app/src/stores/authStore.ts app/App.tsx
git commit -m "feat: add in-app force update via Google Play In-App Updates API"
```

---

### Task 5: Gitignore and Final Cleanup

**Files:**
- Modify: `.gitignore` (ensure generated files excluded)

**Interfaces:**
- Consumes: nothing
- Produces: clean repo state

- [ ] **Step 1: Update `.gitignore`**

Ensure these entries exist (add if missing):
```
# Fastlane
app/fastlane/report.xml
app/fastlane/README.md

# Generated Android project
app/android/

# Keystore
*.keystore
*.jks
```

- [ ] **Step 2: Verify all files present**

Run:
```bash
ls scripts/bump-version.sh
ls app/fastlane/Fastfile app/fastlane/Appfile
ls app/Gemfile
ls .github/workflows/deploy.yml
ls app/src/hooks/useForceUpdate.ts
```
Expected: all files listed without error

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: update gitignore for Fastlane and generated android files"
```
