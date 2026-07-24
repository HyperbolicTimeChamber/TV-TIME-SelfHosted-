# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Code Rules

## Enums everywhere
Always use enum values from `src/enums/index.ts` — never raw string literals for:
- WatchStatus (`"watching"` → `WatchStatus.WATCHING`)
- MediaType (`"tv"` → `MediaType.TV`)
- CacheKey, QueryKey, Route
- DocChangeType (`"removed"` → `DocChangeType.REMOVED`)

## Typecheck
- `npx tsc --noEmit` must run from `app/` or `functions/` directory, NOT repo root (root has no typescript dependency)
- Always typecheck both `app/` and `functions/` after changes
