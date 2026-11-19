/** Asks the alert scheduler to re-plan soon (catalog cache written, a switch changed). Platform-neutral so shared hooks can call it */
type Listener = () => void;

const listeners = new Set<Listener>();

export function requestAiringReplan(): void {
	for (const listener of listeners) listener();
}

export function onAiringReplanRequest(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
