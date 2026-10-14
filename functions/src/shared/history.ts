import { FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * Watch History fields on users/{uid}/tracking/{docId} (mirrors app/src/services/history.ts):
 * - historyAt: last watch — the history list's sort key. Docs without it never appear
 * - historyUpdatedAt: any history-relevant change — the client's delta-sync cursor
 * - minutesWatched: total time incl. rewatches
 * - plays: marks minus unmarks; 0 → back to "not started", hidden from history
 */
export function historyOnWatch(minutes: number, plays: number, at: Timestamp) {
  return {
    historyAt: at,
    historyUpdatedAt: FieldValue.serverTimestamp(),
    minutesWatched: FieldValue.increment(minutes),
    plays: FieldValue.increment(plays),
  };
}

/** Status / pointer change with no watch (stop, resume, rewatch start, reactivation) */
export function historyOnChange() {
  return { historyUpdatedAt: FieldValue.serverTimestamp() };
}
