import LoadingSpinner from "./LoadingSpinner";

/** Full-page loading state with the app's spinner (+ optional caption, like the app) */
export default function LoadingScreen({ label, hint }: { label?: string; hint?: string }) {
	return (
		<div className="flex min-h-[60dvh] flex-col items-center justify-center">
			<LoadingSpinner />
			{label && <span className="mt-4 text-base font-semibold text-fg-secondary">{label}</span>}
			{hint && <span className="mt-1 text-xs text-fg-muted">{hint}</span>}
		</div>
	);
}
