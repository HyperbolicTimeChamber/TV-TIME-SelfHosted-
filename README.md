# TV Time (Self-Hosted)

A self-hosted TV Time clone for tracking TV shows and movies. Built with React Native (Expo) and Firebase — your data stays on your own Firebase project.

## Features

- **Show & Movie Tracking** — Add shows to your watchlist, mark episodes as watched with swipe gestures or tap
- **Episode Progress** — Automatically advances to the next episode/season as you watch
- **Upcoming Episodes** — See what's airing next for shows you're tracking
- **Calendar View** — Monthly calendar with dots on days with upcoming episodes
- **Search & Discovery** — Search TMDB for shows/movies, browse trending content
- **Rewatch Support** — Mark completed shows for rewatch, tracks rewatch count
- **Profile & Stats** — Episodes watched, shows tracking, total watch time
- **Import Data** — Import your watch history from TV Time or other sources
- **Offline Detection** — Overlay when internet is unavailable
- **Dark Mode** — Dark theme throughout

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile App | Expo 57 (React Native), TypeScript |
| Navigation | React Navigation (bottom tabs, material top tabs, native stack) |
| State | Zustand (auth, UI), TanStack React Query (server state, in-memory caching) |
| Animations | React Native Reanimated, Gesture Handler |
| Backend | Firebase (Auth, Firestore, Cloud Functions v2) — Blaze plan required |
| API | TMDB API v3 (via Cloud Functions for catalog ops, direct from client for search/trending) |

## Architecture

```
TV-TIME-SelfHosted-/
├── app/                          # Expo React Native app
│   ├── App.tsx                   # Root: providers, auth gate
│   └── src/
│       ├── components/           # SwipeableCard, ShowCard, EpisodeCard, etc.
│       ├── screens/              # All screen components
│       ├── navigation/           # Bottom tabs + stack navigators
│       ├── hooks/                # Real-time listeners + React Query hooks
│       ├── stores/               # Zustand (auth, UI)
│       ├── services/             # Firestore CRUD + TMDB client
│       ├── types/                # TypeScript types
│       ├── enums/                # WatchStatus, MediaType, QueryKey, CacheKey, etc.
│       └── theme/                # Colors, spacing, typography
├── functions/                    # Firebase Cloud Functions v2
│   └── src/
│       ├── index.ts              # Function exports
│       ├── addShow.ts            # Add show to shared catalog
│       ├── removeShow.ts         # Remove show from catalog
│       ├── syncCatalog.ts        # Weekly catalog refresh from TMDB
│       ├── markSeasonWatched.ts  # Batch mark season as watched
│       ├── rebuildUpcoming.ts    # Rebuild user's upcoming episodes
│       ├── importMatches.ts      # Import watch history
│       └── tmdb.ts               # TMDB API helpers
├── firebase.json
├── firestore.rules
└── firestore.indexes.json
```

## Self-Hosting Setup Guide

Follow these steps to deploy your own instance on your own Firebase project.

### Prerequisites

- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- A [TMDB API key](https://www.themoviedb.org/settings/api)
- For iOS: macOS + Xcode + CocoaPods
- For Android: Android Studio + SDK

### 1. Clone & Install

```bash
git clone https://github.com/HyperbolicTimeChamber/TV-TIME-SelfHosted-.git
cd TV-TIME-SelfHosted-

# Install app dependencies
cd app && npm install && cd ..

# Install Cloud Functions dependencies
cd functions && npm install && cd ..
```

### 2. Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project
2. **Upgrade to Blaze plan** (pay-as-you-go) — required for Cloud Functions
3. Enable **Authentication**:
   - Go to Authentication → Sign-in method
   - Enable **Google** as a sign-in provider
   - Note the **Web client ID** from the Google provider config (you'll need it in step 4)
4. Enable **Cloud Firestore**:
   - Create a database in your preferred region
   - Start in production mode (rules will be deployed in step 6)

### 3. Download Firebase Config Files

From your Firebase project settings (gear icon → Project settings):

**Android:**
1. Add an Android app with package name `com.tvtimerevived.app`
2. Download `google-services.json`
3. Place it at `app/google-services.json`

**iOS:**
1. Add an iOS app with bundle ID `com.tvtimerevived.app`
2. Download `GoogleService-Info.plist`
3. Place it at `app/GoogleService-Info.plist`

> **Note:** These files are gitignored and will not be committed.

### 4. Configure Environment Variables

```bash
cp .env.example app/.env
```

Edit `app/.env` and set your Web Client ID:

```
EXPO_PUBLIC_WEB_CLIENT_ID=your_web_client_id.apps.googleusercontent.com
```

You can find this in the [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) — it's the "Web client" OAuth 2.0 client ID that Firebase auto-created.

### 5. Set Your Firebase Project ID

Edit `.firebaserc` and replace the project ID with yours:

```json
{
  "projects": {
    "default": "your-firebase-project-id"
  }
}
```

### 6. Store the TMDB API Key in Firestore

The Cloud Functions read the TMDB API key from a Firestore document. Create it manually:

1. Go to Firestore in the Firebase Console
2. Create a collection called `config`
3. Add a document with ID `app`
4. Add a field: `tmdbApiKey` (string) → paste your [TMDB API key](https://www.themoviedb.org/settings/api)

### 7. Deploy Firebase (Rules, Indexes, Functions)

```bash
firebase login
firebase deploy
```

This deploys Firestore rules, indexes, and all Cloud Functions in one command.

### 8. Build & Run the App

```bash
cd app

# Generate native projects
npx expo prebuild

# Run on your device/simulator
npx expo run:ios      # or run:android
```

> **Important:** This app uses native modules (Firebase, Google Sign-In) and requires a dev build — Expo Go will not work.

## Files You Need (Summary)

| File | Location | How to get it |
|------|----------|---------------|
| `google-services.json` | `app/google-services.json` | Firebase Console → Project Settings → Android app |
| `GoogleService-Info.plist` | `app/GoogleService-Info.plist` | Firebase Console → Project Settings → iOS app |
| `.env` | `app/.env` | Copy from `.env.example`, fill in Web Client ID |
| `.firebaserc` | `.firebaserc` | Edit with your Firebase project ID |
| TMDB API key | Firestore `config/app` doc | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) |

## Security

- All Firestore data is user-scoped — users can only read/write their own data (enforced by security rules)
- Shared catalog (`shows/`) allows authenticated users to read, but only Cloud Functions can create/delete
- TMDB API key is stored in a `config/app` document, readable only by authenticated users
- No secrets are stored in client code

## Scripts

```bash
# From app/
npm run start      # Start Expo dev server
npm run ios        # Run on iOS
npm run android    # Run on Android

# From functions/
npm run build      # Compile TypeScript
npm run deploy     # Deploy Cloud Functions

# From root
firebase deploy                    # Deploy everything
firebase deploy --only functions   # Deploy only Cloud Functions
firebase deploy --only firestore   # Deploy only rules + indexes
```

## License

MIT
