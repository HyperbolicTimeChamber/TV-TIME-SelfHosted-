# Mixpanel: events and the "Firebase Cost & Usage" dashboard

Config is per deployment, never in the repo, so a fork or clone never sends events here:

| Where | Keys | Source |
| --- | --- | --- |
| App | `EXPO_PUBLIC_MIXPANEL_TOKEN`, `EXPO_PUBLIC_MIXPANEL_SERVER_URL` | `app/.env` (CI: repo Secrets) |
| Web | `VITE_MIXPANEL_TOKEN`, `VITE_MIXPANEL_SERVER_URL` | `web/.env.local` / `.env.production` (CI: repo Secrets) |
| Cloud Functions + scripts | `MIXPANEL_TOKEN`, `MIXPANEL_SERVER_URL` | `functions/.env.<projectId>` (gitignored; template `functions/.env.example`) |

No token, no tracking: the clients don't create the SDK, and the backend skips sending.
`firebase deploy` loads `.env.<projectId>` only for that project, so a deploy to any other project
sends nothing. Scripts load the same file (`hooks/projectEnv.ts`) for `GCLOUD_PROJECT` or the
`.firebaserc` default.

**EU data residency**: send to `https://api-eu.mixpanel.com` (same host everywhere). The US host
does not ingest this project's events. Reports live at `eu.mixpanel.com`. Signed-in users get a
profile (`$email`, `$name`) so cost tables can name them.

The token is a public ingestion key: it ships inside every app and web build and can't be kept
secret from someone who inspects one. Keeping it out of the repo stops accidental tracking from
forks, not deliberate spoofing. If a token is abused, rotate it in Mixpanel (Project Settings) and
update the Secrets and `.env` files.

## Where events come from

Every event carries `client_platform`, so any report can be split **app vs web vs backend**.

| `client_platform` | Sender | Code |
| --- | --- | --- |
| `app` | React Native app (iOS / Android) | `app/src/services/mixpanel.ts` |
| `web` | Web app (same module, `mixpanel-browser` shim) | `web/src/platform/mixpanel.ts` |
| `cloud_function` | Every Cloud Function run | `functions/src/hooks/metrics.ts`, `trackedTriggers.ts` |
| `script` | `functions/scripts/*` runs | `startScriptMetrics` / `finishScriptMetrics` |

Backend events also carry `caller_platform` — who caused the run: `app` / `web` (callables: the
clients send `clientPlatform` with every call), `system` (schedules, triggers, budget alerts),
`unknown` (a client build older than this instrumentation). `tmdbProxy` / `sharePreview` report
`web`.

## Events

| Event | Sent by | Properties |
| --- | --- | --- |
| `app_opened` | app, web | `source` (organic / push / deep_link), `days_since_last_open`, `device_platform`, `app_version` |
| `sign_up_completed` | app, web | `month_utc` — first auth of an account created < 10 min ago |
| `page_viewed` | app, web | `page` — app screen name; web routes mapped to the same names (`Watchlist`, `ShowDetail`, …) |
| `api_called` | app, web | `api_type` (tmdb / cloud_function / firestore), `endpoint` (ids → `:id`), `success`, `duration_ms`, `error` |
| `firestore_ops` | app, web, cloud_function, script | `reads`, `writes`, `deletes`, `total_ops` (+ `function_name`, `caller_platform` from backend) |
| `function_invoked` | cloud_function, script | `function_name`, `caller_platform`, `success`, `duration_ms`, `tmdb_calls`, `tvmaze_calls`, `other_api_calls` |
| `episode_marked_tracked` | app, web | `show_id`, `episode_id`, `episode_number`, `month_utc` |
| `episode_tracking_session_completed` | app, web | `items_tracked_count`, `duration_seconds`, `show_count_covered`, `month_utc` |

`firestore_ops` is aggregated to save event quota: clients send one event per minute of activity
(and on background / tab hide); the backend sends one per function run or script. **Always chart
the Sum of `reads` / `writes` / `deletes`, never the event count.** Counts approximate billing:
cache hits are 0, a query is max(docs, 1), listeners count changed docs, server-side
`recursiveDelete` / `Query.stream` reads are not seen.

## Dashboard: "Firebase Cost & Usage"

Board: https://eu.mixpanel.com/project/4078775/app/boards#id=11622139 (Last 7 days). Goal: find what
drives the Firebase bill — which users, which functions / scripts, which client APIs, app vs web.
The Free plan caps a board at **5 saved reports**; text cards don't count.

**Read-equivalent ops** = `reads + 3 × writes + deletes / 3` (Firestore list-price ratio). Use it to rank
cost; the raw sums sit beside it.

| Tile | Report setup | Chart |
| --- | --- | --- |
| Firebase Billable Usage | Sum `firestore_ops.reads` / `writes` / `deletes`, `function_invoked` Total, Sum `duration_ms`, Sum `tmdb_calls` · compare previous week | Metric |
| Firestore Cost by Source (daily) | Sum reads / writes / deletes + formula Read-equivalent ops · breakdown `client_platform` × `caller_platform` · Day | Stacked line |
| Top Users by Cost | Sum reads / writes / deletes, `function_invoked` Total, `api_called` Total + formula · breakdown user `$email` × `$distinct_id` | Table |
| Cost by Function / Script | Sum reads / writes / deletes, `function_invoked` Total, Sum `duration_ms` / `tmdb_calls` / `tvmaze_calls` + formula · breakdown `client_platform` × `function_name` × `caller_platform` | Table |
| Client API Calls (app vs web) | `api_called` Total + Average `duration_ms` · breakdown `client_platform` × `api_type` × `endpoint` | Table |
| Reading this board | Text card: cost weights, platform meanings, what isn't tracked | Text |

Reading the source split: `app` / `web` rows = Firestore ops done directly by a client;
`cloud_function` / `script` rows = backend, with `caller_platform` saying who caused them (app / web /
system / unknown). In "Cost by Function / Script", app/web rows with no `function_name` are the
direct client ops.

**Billable but not tracked here:** Firestore storage, network egress, Hosting bandwidth, Auth. Check
those in the GCP billing console.

### Ad-hoc reports (not on the board)

| Question | Report |
| --- | --- |
| Function errors / latency | `function_invoked` · Total · breakdown `function_name` × `success`; Average `duration_ms` by `function_name` |
| Active users | Any event · Unique users · filter `client_platform` ≠ cloud_function, ≠ script |
| Most used pages | `page_viewed` · Total · breakdown `page` |
| User flow | Funnel `sign_up_completed` → `app_opened` → `page_viewed` (page = Watchlist) → `api_called` · 7 days |
| Locations | `api_called` · Total · breakdown `mp_country_code` × `$city` |

Backend events without a signed-in user have an empty `distinct_id` (not counted as users), and
are sent with `ip=0`, so they never skew user counts or locations.
