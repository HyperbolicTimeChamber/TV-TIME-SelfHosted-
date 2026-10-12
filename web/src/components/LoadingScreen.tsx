import LoadingSpinner from "./LoadingSpinner";

/** Full-page loading state with the app's spinner (+ optional caption, like the app) */
export default function LoadingScreen({ label, hint }: { label?: string; hint?: string }) {
	return (
		<div
			style={{
				minHeight: "60dvh",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<LoadingSpinner />
			{label && <span style={{ color: "var(--text-secondary)", fontSize: 16, fontWeight: 600, marginTop: 16 }}>{label}</span>}
			{hint && <span style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>{hint}</span>}
		</div>
	);
}
