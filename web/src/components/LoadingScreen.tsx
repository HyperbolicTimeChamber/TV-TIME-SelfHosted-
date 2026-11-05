import LoadingSpinner from "./LoadingSpinner";
import PoweredByTmdb from "./PoweredByTmdb";

/** Full-page loading state with the app's spinner (+ optional caption, like the app) */
export default function LoadingScreen({
	label,
	hint,
	splash = false,
}: {
	label?: string;
	hint?: string;
	/** The boot screen (app splash): full height, TMDB credit at the bottom */
	splash?: boolean;
}) {
	if (splash) {
		return (
			<div className="relative flex min-h-dvh flex-col items-center justify-center">
				<LoadingSpinner />
				<PoweredByTmdb className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+32px)]" />
			</div>
		);
	}
	return (
		<div className="flex min-h-[60dvh] flex-col items-center justify-center">
			<LoadingSpinner />
			{label && <span className="mt-4 text-base font-semibold text-fg-secondary">{label}</span>}
			{hint && <span className="mt-1 text-xs text-fg-muted">{hint}</span>}
		</div>
	);
}
