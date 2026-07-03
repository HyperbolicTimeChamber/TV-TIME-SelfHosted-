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
| State | Zustand (auth, UI), TanStack React Query (server state, in-memory caching) |
| Animations | React Native Reanimated, Gesture Handler |
| Backend | Firebase (Auth, Firestore) — Spark (free) plan |
| API | TMDB API v3 (queried directly from the client) |

## Architecture

This app runs entirely on the Firebase **Spark (free) plan** — no Cloud Functions, no Blaze billing required.

- **TMDB API calls** are made directly from the client. Each user provides their own TMDB API key during onboarding; it is stored in their Firestore user profile and never shared with other users.
- **In-memory caching** is handled by TanStack React Query, eliminating the need for server-side cache collections.
- **Stats** (episodes watched, total minutes, shows tracking) are updated via client-side batch writes directly to Firestore.
- **No server-side code** — there are no Cloud Functions or Firestore triggers.

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
│       ├── services/             # Firestore CRUD + TMDB client
│       ├── types/                # TypeScript types
│       └── theme/                # Colors, spacing, typography
├── firebase.json
├── firestore.rules
└── firestore.indexes.json
```

## Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase project with Auth and Firestore enabled (Spark plan is sufficient)
- A [TMDB API key](https://www.themoviedb.org/settings/api) — each user provides their own during onboarding
- For iOS: Xcode + CocoaPods
- For Android: Android Studio + SDK

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/TV-TIME-SelfHosted-.git
cd TV-TIME-SelfHosted-
cd app && npm install
```

### 2. Firebase Configuration

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** (Google Sign-In provider)
3. Enable **Cloud Firestore**
4. No Blaze plan or Cloud Functions required

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

### 3. TMDB API Key (Per-User Onboarding)

No environment variable or Firebase secret is needed. When a new user signs in for the first time, the app presents an onboarding screen asking them to enter their personal [TMDB API key](https://www.themoviedb.org/settings/api). The key is saved to their Firestore user profile (`users/{uid}/tmdbApiKey`) and used for all subsequent TMDB requests from that account.

### 4. Google Sign-In

Update the `webClientId` in `app/App.tsx` with your OAuth 2.0 web client ID from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

### 5. Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore
```

### 6. Run the App

```bash
cd app
npx expo prebuild
npx expo run:ios    # or run:android
```

> **Note:** This app uses native modules (Firebase, Google Sign-In) and requires a dev build — Expo Go will not work.

## Security

- All Firestore data is user-scoped — users can only read/write their own data
- Each user's TMDB API key is stored in their own Firestore document, readable only by them (enforced by security rules)
- No server-side secrets or Cloud Functions are used

## Scripts

```bash
# From app/
npm run start      # Start Expo dev server
npm run ios        # Run on iOS
npm run android    # Run on Android
```

## License

MIT
