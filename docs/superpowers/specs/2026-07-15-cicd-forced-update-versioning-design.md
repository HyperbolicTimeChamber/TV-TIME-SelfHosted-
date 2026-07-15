# CI/CD Pipeline, Forced Update & Auto-Versioning Design

## Overview

Three integrated subsystems:
1. **Auto-versioning** — semantic version bump on push/merge to `main`
2. **CI/CD pipeline** — GitHub Actions + Fastlane → build AAB → deploy to Play Store internal testing
3. **Forced update** — Google In-App Updates API with Firestore-driven minimum version

## 1. Auto-Versioning

### Source of Truth
- `app/app.json` → `expo.version` (display version, e.g., `"1.2.5"`)
- `app/app.json` → `expo.android.versionCode` (integer build number, e.g., `6`)
- `app/package.json` → `version` (kept in sync)

### Bump Rules
| Trigger | Example | Rule |
|---|---|---|
| Default (no flag) | `1.2.5` → `1.2.6` | Patch bump |
| `[minor]` commit msg OR `bump:minor` PR label | `1.2.5` → `1.3.0` | Minor bump, reset patch |
| `[major]` commit msg OR `bump:major` PR label | `1.2.5` → `2.0.0` | Major bump, reset minor+patch |

- PR labels checked first, then commit message
- `versionCode` increments by 1 on every build regardless of bump type
- Version bump committed back to `main` with `[skip ci]` tag to prevent infinite loop

### Script: `scripts/bump-version.sh`
- Accepts `--minor` or `--major` flag (default: patch)
- Reads current version from `app/app.json`
- Computes new version + increments `versionCode`
- Updates both `app/app.json` and `app/package.json`
- Outputs new version string for downstream use

## 2. CI/CD Pipeline

### Technology
- **GitHub Actions** — orchestration
- **Fastlane** — Android build + Play Store upload
- **Expo Prebuild** — generates native `android/` project from Expo config

### Caching
Three cache layers to reduce build time:
1. **Node modules** — `actions/cache` keyed on `app/package-lock.json` hash
2. **Ruby/Fastlane** — `ruby/setup-ruby` built-in bundler cache
3. **Gradle** — `actions/cache` keyed on `**/*.gradle*` + `gradle-wrapper.properties` hashes

Cache is safe with build errors:
- Keys based on lockfile hashes → dependency changes invalidate cache automatically
- Gradle only caches successful compilation artifacts
- `expo prebuild --clean` regenerates `android/` fresh every run regardless

### Triggers

#### On PR to `main`
1. Checkout code
2. Install Node deps (`npm ci` in `app/`)
3. `npx expo prebuild --platform android --clean`
4. Setup Ruby + Fastlane
5. Decode keystore from secret
6. Fastlane `build` lane → signed release AAB
7. Fastlane `supply` → upload to Play Store **internal testing** track
8. Comment on PR with build status + version

#### On Push to `main`
1. Skip if commit message contains `[skip ci]`
2. Checkout code
3. Detect bump flags:
   - Check merged PR labels (`bump:minor`, `bump:major`)
   - Check commit message for `[minor]`, `[major]`
4. Run `scripts/bump-version.sh` with detected flag
5. Commit + push version bump with `[skip ci]`
6. Install Node deps
7. `npx expo prebuild --platform android --clean`
8. Setup Ruby + Fastlane
9. Decode keystore from secret
10. Fastlane `build` lane → signed release AAB
11. Fastlane `supply` → upload to internal testing track
12. If `[force-update]` in commit message → update Firestore `config/app.minVersion` to new version

### Fastlane Configuration

Note: Fastlane files live at `app/fastlane/` (not inside `android/`). Prebuild generates `android/` — Fastlane references it via `gradle_file` path.

#### `app/fastlane/Appfile`
```ruby
json_key_file(ENV["PLAY_SERVICE_ACCOUNT_JSON_PATH"])
package_name("com.tvtimerevived.app")
```

#### `app/fastlane/Fastfile`
Two lanes:
- `build` — runs Gradle `bundleRelease`, produces signed AAB
- `deploy` — calls `build`, then `supply` to upload AAB to internal testing track

### GitHub Secrets Required
| Secret | Purpose |
|---|---|
| `KEYSTORE_BASE64` | Release keystore, base64 encoded |
| `KEYSTORE_PASSWORD` | Keystore password |
| `KEY_ALIAS` | Signing key alias |
| `KEY_PASSWORD` | Signing key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | Google Play API service account JSON |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK key (for `minVersion` update) |

### Workflow File
`.github/workflows/deploy.yml`

## 3. Forced Update (Google In-App Updates)

### Library
`sp-react-native-in-app-updates` — React Native wrapper for Google's `com.google.android.play.core` In-App Updates API.

### Firestore Schema
Existing `config/app` document — add field:
```
minVersion: "1.0.0"  // string, semver
```

### App-Side Logic

#### Hook: `app/src/hooks/useForceUpdate.ts`
On app launch:
1. Read `config/app.minVersion` from Firestore (already loaded in `authStore`)
2. Get current app version from `app.json` (via `expo-constants` or `Application.nativeApplicationVersion`)
3. Compare using semver:
   - If `currentVersion < minVersion` → trigger **IMMEDIATE** update (full-screen, blocks app)
   - Else → trigger **FLEXIBLE** update (background download, snackbar prompt to install)
4. Handle edge cases:
   - No update available (app is latest) → no-op
   - Play Store not available (sideloaded) → show manual update message
   - `minVersion` not set → default to flexible check

#### Integration: `app/App.tsx`
- Call `useForceUpdate()` after auth initialization
- Immediate update blocks entire app UI until updated
- Flexible update shows Google's native install banner

### Setting `minVersion`

#### Automatic (CI/CD)
- `[force-update]` in commit message during push to `main`
- Deploy workflow uses Firebase Admin SDK to set `config/app.minVersion` to the newly built version
- Uses `FIREBASE_SERVICE_ACCOUNT_JSON` secret

#### Manual
- Edit `config/app.minVersion` in Firebase Console anytime
- Useful for emergency forced updates without new deploy

## 4. Files Created/Modified

| File | Action | Purpose |
|---|---|---|
| `.github/workflows/deploy.yml` | Create | GH Actions workflow |
| `app/fastlane/Fastfile` | Create | Build + deploy lanes |
| `app/fastlane/Appfile` | Create | Package name + service account |
| `app/Gemfile` | Create | Fastlane Ruby dependency |
| `scripts/bump-version.sh` | Create | Version bump script |
| `app/src/hooks/useForceUpdate.ts` | Create | In-app update check hook |
| `app/app.json` | Modify | Add `versionCode` to android config |
| `app/App.tsx` | Modify | Add `useForceUpdate()` call |
| `app/package.json` | Modify | Add `sp-react-native-in-app-updates` dep |

## 5. Prerequisites (Manual Steps)

Before pipeline works:
1. **Create release keystore** — `keytool -genkey` → base64 encode → add as GH secret
2. **Google Play Console** — create app listing, enable internal testing track
3. **Service account** — create in Google Cloud Console, grant Play Console access, download JSON → GH secret
4. **Firebase service account** — download from Firebase Console → GH secret
5. **First APK/AAB** — must be manually uploaded to Play Console once before API uploads work
6. **Add Expo plugin** for `sp-react-native-in-app-updates` if needed

## 6. Expo Plugin

`sp-react-native-in-app-updates` requires `com.google.android.play:app-update` dependency. May need a custom Expo config plugin to add it to `build.gradle` during prebuild. Will verify during implementation and create plugin if needed (similar to existing `plugins/withModularHeaders`).
