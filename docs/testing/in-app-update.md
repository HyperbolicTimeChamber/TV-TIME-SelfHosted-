# In-app update — staging test flow

Staging builds (`staging` branch → GitHub pre-release `vX.Y.Z+BUILD-staging`) use the **dev**
channel: `config/release.dev`. Production (`main` → release `vX.Y.Z+BUILD`) uses `config/release.prod`.
Nothing here touches prod.

## How it works

1. CI builds the APK, publishes the GitHub release, deletes older builds of the same version, then
   runs `scripts/publish-release.cjs`: writes `config/release.{channel}` (version, build, APK url,
   size, notes), and on `[force-update]` sets `minBuild` (+ legacy `config/app.minBuild{Dev,Prod}`),
   and sends an FCM data push to topic `app-updates-{channel}`.
2. The app listens to `config/release` (public doc). Build below `build` → **Update Available**
   drawer (Update / Not Now). Not Now hides it until a newer build. Build below `minBuild` →
   **Update Required**: the app stays behind the drawer with its cached data (taking no touches;
   nobody is signed out), the drawer can't be put off, back / drag down / Close App exit the app;
   every callable refuses the build (`failed-precondition: update-required`).
3. Update downloads the APK in the drawer (progress bar, Cancel), then opens Android's installer.
   The first time, Android asks to allow installs from Watchloom (toggle, then back, then Update →
   Install again). After installing, the installer's **Open** button starts the new version
   (Android doesn't let an updated app relaunch itself).
4. The push shows **vx.y.z is available** with a red **Upgrade**: the download runs from the
   notification (dark card, red progress bar, red Cancel), then **Tap to install** opens Android's
   installer directly (native module `app/modules/update-notification`).

## Checklist (on a staging build, signed in)

Get two staging builds: install the older one (or keep the current), push another commit to
`staging` so a newer one is released.

| # | Step | Expect |
|---|------|--------|
| 1 | Push to `staging`; wait for CI | New pre-release on GitHub; older builds of the same version gone; notification arrives on the older build |
| 2 | Open the older build | Update Available drawer: `V old → V new`, notes |
| 3 | Not Now, reopen app | No drawer (until a newer build) |
| 4 | Settings → Updates (test) → Reset "Not Now", reopen | Drawer is back |
| 5 | Update | Progress bar fills; Cancel stops it and returns to Update |
| 6 | Update again → finish | Android installer (first time: allow installs from this source) |
| 7 | Install → Open | New version runs; Settings / Login show the new `vx.y.z` |
| 8 | Notification → Install (app in background) | Progress on the notification, then Tap to install → installer |
| 9 | `node scripts/release-test.cjs force` | Older build: Update Required over the cached app, no Not Now; back / Close App exit; still signed in |
| 10 | `node scripts/release-test.cjs unforce` | Older build usable again |

No second build handy: Settings → Updates (test) → **Simulate Update** / **Simulate Force Update**
pretend the latest staging build is newer than the installed one (the download / install use the
real latest staging APK — installing it over the same build number fails, which is expected).
**Show Update Notification** shows the push's notification locally.

## Commands

```bash
# needs GOOGLE_APPLICATION_CREDENTIALS (service account) and gh; --emulator for the Emulator Suite
node scripts/release-test.cjs status    # config/release.dev
node scripts/release-test.cjs offer     # dev → newest -staging release
node scripts/release-test.cjs force     # newest staging build is the minimum
node scripts/release-test.cjs unforce   # remove the minimum
node scripts/release-test.cjs notify    # send the new-version push to app-updates-dev
```

## Test push from a PC (after a release)

`sendTestPush` (HTTP Cloud Function, key-protected) sends the update notification for a channel's
current release to one account's phone, or to the whole channel. Marked as a test, the app shows
it even when it already has that build (Install downloads the real APK).

```bash
# one-time: create the key, then deploy the function
firebase functions:secrets:set TEST_PUSH_KEY
firebase deploy --only functions:sendTestPush

# send (key: firebase functions:secrets:access TEST_PUSH_KEY)
TEST_PUSH_KEY=… scripts/send-test-push.sh you@example.com prod   # your phone, production release
TEST_PUSH_KEY=… scripts/send-test-push.sh you@example.com dev    # your phone, staging release
TEST_PUSH_KEY=… scripts/send-test-push.sh "" dev                 # every staging install
```

The phone must be signed in with that account and have allowed notifications. Local: the
functions emulator reads the key from `functions/.secret.local`.

## Limits

- Android only (iOS can't sideload). Web is always the latest.
- Installs only over a build signed with the same key (CI keystore). A local dev build can show the
  drawer, download and installer, but the install itself fails (debug key).
- Firestore reads/writes of a blocked build are stopped in the app (it doesn't load past the
  gate); the security rules don't check the build.
