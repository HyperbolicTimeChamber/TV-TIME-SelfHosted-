# Watchloom Web

Web version of the Watchloom mobile app — same features, responsive (phone
browsers look and feel like the app; desktop gets a side rail and wider grids).
Live at https://watchloom-app.web.app.

Stack: Vite · React · TypeScript · Redux Toolkit · antd · Motion · React Router ·
TanStack Query (same persisted-cache strategy as the app) · Firebase JS SDK.

## Shared code with the app

The web imports the mobile app's platform-neutral logic straight from
`../app/src` (`@app/*`): hooks, services, utils, types, enums, theme and the
screen logic hooks (`useSearchActions`, `useShowDetailActions`,
`useSeasonActions`, `useWatchlistScreen`, `useUpcomingScreen`,
`useCalendarScreen`, `useImportData`). `vite.config.ts` swaps React Native
modules for web shims in `src/platform/`:

| App import | Web shim |
| --- | --- |
| `@react-native-firebase/firestore` / `functions` / `analytics` | Firebase JS SDK |
| `@react-native-async-storage/async-storage` | `localStorage` |
| `react-native` (`Alert`, `Platform`, `PixelRatio`) | antd notifications / browser APIs |
| `app/src/stores` (zustand) | Redux-backed `useAuthStore` / `useUiStore` |

**Put new logic in the app's hooks/services so both platforms get it; only UI is per-platform.**

## Project layout

```
web/
  src/
    components/ layout/ screens/ routes/ store/ platform/ hooks/ services/ utils/
      styles/               ← each folder's SCSS modules live in its own styles/
    theme/
      index.ts              ← colours, spinnerShape, antd theme
      _tokens.scss          ← SCSS colours (from app/src/theme) + breakpoint mixins
      global.scss
      tailwind.css          ← Tailwind theme + utilities (no preflight), app colours
  tests/                    ← Vitest tests, mirroring src/ (+ setup.ts, render.tsx)
```

Styling:

- **SCSS modules** for component structure: `components/styles/ShowCard.module.scss`
  with `@use "../../theme/tokens" as *` for `$primary`, `@include desktop { … }` etc.
- **Tailwind** instead of inline `style={{}}` blocks. Colours use the app names
  (`bg-surface`, `text-fg-muted`, `bg-primary` …). Module rules beat utilities, so add
  `!` when overriding one (`mt-6!`).
- **Runtime values** go through CSS vars: `style={cssVars({ "--size": px(n) })}` with
  `className="size-(--size)"` (`utils/cssVars.ts`). Only Motion values stay in `style`.

## Logged out

Search and show pages work without an account (read-only — no add/mark
buttons). TMDB calls go through the `tmdbProxy` Cloud Function at
`/api/tmdb/**` (allowlisted endpoints, CDN-cached, rate-limited, App Check).

## Scripts

```bash
npm run dev        # local dev (.env.local), /api/tmdb proxied to the live site
npm test           # vitest
npm run build      # typecheck + production build
```

## Env (`.env.local` locally, CI writes `.env.production` from repo Secrets)

`VITE_FIREBASE_*` (public web config), `VITE_WEB_BASE_URL`, `VITE_TMDB_API_BASE`,
`VITE_TMDB_PROXY_BASE=/api/tmdb`, optional `VITE_RECAPTCHA_SITE_KEY` (App Check).

## Deploy

`.github/workflows/web-deploy.yml` runs on pushes to `development` that touch
`web/`, `app/src/`, `firebase.json` or the workflow: tests → build → Firebase Hosting.

Android App Links: Firebase Hosting serves `/.well-known/assetlinks.json`
automatically from the SHA-256 fingerprints registered on the Android app in
Firebase → Project settings (add the Play app-signing + upload key there).
Share links `/show/{tv|movie}/{id}` are served by the `sharePreview` function
with Open Graph tags, then load the app.
