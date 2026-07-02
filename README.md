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
- **Offline Detection** — Overlay when internet is unavailable
- **Dark Mode** — Dark theme throughout

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile App | Expo (React Native), TypeScript |
| Navigation | React Navigation (bottom tabs, material top tabs, native stack) |
| State | Zustand (auth, UI), TanStack React Query (server state) |
| Animations | React Native Reanimated, Gesture Handler |
| Backend | Firebase (Auth, Firestore, Cloud Functions v2) |
| API | TMDB API v3 (proxied through Cloud Functions) |

## Project Structure

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
│       ├── services/             # Firestore CRUD + callable function wrappers
│       ├── types/                # TypeScript types
│       └── theme/                # Colors, spacing, typography
├── functions/                    # Firebase Cloud Functions
│   └── src/
│       ├── tmdb/                 # TMDB proxy endpoints (cached)
│       ├── triggers/             # Firestore triggers (stats, watchlist)
│       └── index.ts              # Export all functions
├── firebase.json
├── firestore.rules
└── firestore.indexes.json
```

## Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase project with Auth, Firestore, and Functions enabled
- A [TMDB API key](https://www.themoviedb.org/settings/api)
- For iOS: Xcode + CocoaPods
- For Android: Android Studio + SDK

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/TV-TIME-SelfHosted-.git
cd TV-TIME-SelfHosted-
cd app && npm install
cd ../functions && npm install
```

### 2. Firebase Configuration

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** (Google Sign-In provider)
3. Enable **Cloud Firestore**
4. Enable **Cloud Functions** (Blaze plan required)

**Android:** Download `google-services.json` → place in `app/android/app/`

**iOS:** Download `GoogleService-Info.plist` → place in `app/ios/`

Update `.firebaserc` with your project ID:
```json
{
  "projects": {
    "default": "your-firebase-project-id"
  }
}
```

### 3. TMDB API Key

```bash
firebase functions:secrets:set TMDB_API_KEY
# Enter your TMDB API key when prompted
```

### 4. Google Sign-In

Update the `webClientId` in `app/App.tsx` with your OAuth 2.0 web client ID from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

### 5. Deploy Functions & Rules

```bash
firebase deploy --only functions,firestore
```

### 6. Run the App

```bash
cd app
npx expo prebuild
npx expo run:ios    # or run:android
```

> **Note:** This app uses native modules (Firebase, Google Sign-In) and requires a dev build — Expo Go will not work.

## Cloud Functions

All TMDB API calls are proxied through Cloud Functions to keep the API key server-side. Responses are cached in Firestore to reduce API calls.

| Function | Description | Cache TTL |
|----------|-------------|-----------|
| `searchMulti` | Search shows & movies | None (real-time) |
| `getTrending` | Trending TV/movies | 1 hour |
| `getShowDetails` | Show/movie details | 24 hours |
| `getSeasonDetails` | Season episodes | 24 hours |
| `getUpcomingEpisodes` | Upcoming for tracked shows | None |

### Firestore Triggers

| Trigger | Action |
|---------|--------|
| `onUserCreate` | Initialize user profile with empty stats |
| `onEpisodeCreated/Deleted/Updated` | Update `stats.episodesWatched` and `stats.totalMinutes` |
| `onWatchlistAdded/Removed` | Update `stats.showsTracking` |

## Security

- All Firestore data is user-scoped — users can only read/write their own data
- Cache collections are read-only for clients (written by Cloud Functions via Admin SDK)
- All Cloud Functions require Firebase authentication
- TMDB API key is stored as a Firebase secret, never exposed to the client

## Scripts

```bash
# From root
npm run app:start          # Start Expo dev server
npm run app:ios            # Run on iOS
npm run app:android        # Run on Android
npm run functions:build    # Build Cloud Functions
npm run functions:serve    # Local emulator
npm run functions:deploy   # Deploy to Firebase
```

## License

MIT
