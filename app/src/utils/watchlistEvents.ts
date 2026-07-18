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
