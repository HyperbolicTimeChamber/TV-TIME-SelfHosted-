type Listener = (tmdbId: number) => void;
const listeners = new Set<Listener>();

export function onShowRemoved(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitShowRemoved(tmdbId: number) {
  for (const listener of listeners) listener(tmdbId);
}

// --- Show added event (optimistic insert into watchlist) ---
import type { EnrichedTrackingItem } from "../hooks/useWatchlist";

type AddedListener = (item: EnrichedTrackingItem) => void;
const addedListeners = new Set<AddedListener>();

export function onShowAdded(listener: AddedListener) {
  addedListeners.add(listener);
  return () => {
    addedListeners.delete(listener);
  };
}

export function emitShowAdded(item: EnrichedTrackingItem) {
  for (const listener of addedListeners) listener(item);
}
