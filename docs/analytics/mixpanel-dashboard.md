# Mixpanel: events and the "App Analytics" dashboard

Project token `8605747605f73b5771dcc67d29d62a58` (public by design — clients and backend share it;
no secret is needed to send events). US data residency (`api.mixpanel.com`).

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

## Dashboard: tile by tile

Create a Board "App Analytics", date range Last 7 days. All reports are **Insights** unless noted.
Add **Breakdown → `client_platform`** to any tile to get the app / web / backend split.

| Tile (mockup) | Report setup | Chart |
| --- | --- | --- |
| Total Active Users | Any event · **Unique users** · filter `client_platform` in (app, web) · compare to previous period | Metric |
| Total API Calls | `api_called` · Total events · compare to previous period | Metric |
| Total Reads (per day) | `firestore_ops` · **Sum of `reads`** · interval Day | Metric (+ line) |
| Total Writes (per day) | `firestore_ops` · Sum of `writes` · Day | Metric |
| Total Deletes (per day) | `firestore_ops` · Sum of `deletes` · Day | Metric |
| Active Users Trend | Any event · Unique users · filter `client_platform` in (app, web) · Day | Line |
| API Calls by Endpoint | `api_called` · Total · breakdown `endpoint` (top 5) | Pie |
| Most Used Pages | `page_viewed` · Total · breakdown `page` (top 5) | Bar |
| Highest Active Users | Metrics A `api_called` Total, B/C/D `firestore_ops` Sum of reads / writes / deletes · breakdown **User ID** · sort A desc, top 5 | Table |
| User Flow | **Funnels**: `sign_up_completed` → `app_opened` → `page_viewed` (page = Watchlist) → `api_called` · window 7 days | Funnel |
| Reads / Writes / Deletes Trend | `firestore_ops` · Sum of reads, Sum of writes, Sum of deletes · Day | Line |
| Top User Locations | `api_called` · Total · breakdown `City` (or `Country`) | Map / table |
| Recent Activity | **Events** page (live feed), filter `client_platform` in (app, web) — link it from a text card | — |

### App vs web vs backend (extra tiles)

| Question | Report |
| --- | --- |
| API calls from app vs web | `api_called` · Total · breakdown `client_platform` |
| Reads/writes/deletes per source | `firestore_ops` · Sum of reads / writes / deletes · breakdown `client_platform` |
| Backend work caused by app vs web | `firestore_ops` · filter `client_platform` = cloud_function · Sum of total_ops · breakdown `caller_platform` |
| Busiest functions | `firestore_ops` · Sum of total_ops · breakdown `function_name` |
| Function errors / latency | `function_invoked` · Total · breakdown `success`; Average of `duration_ms` by `function_name` |
| Script runs | `function_invoked` · filter `client_platform` = script · breakdown `function_name` |

Backend events without a signed-in user have an empty `distinct_id` (not counted as users), and
are sent with `ip=0`, so they never skew user counts or locations.
