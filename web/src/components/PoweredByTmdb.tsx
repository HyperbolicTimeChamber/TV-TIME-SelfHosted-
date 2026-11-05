/** "Powered by" over TMDB's attribution logo (app PoweredByTmdb) — boot splash + settings */
export default function PoweredByTmdb({ className = "" }: { className?: string }) {
	return (
		<div className={`flex flex-col items-center gap-2 ${className}`}>
			<span className="text-xs text-fg-muted">Powered by</span>
			<img
				src="/tmdb-logo.svg"
				alt="TMDB"
				width={120}
				height={16}
				className="block h-auto w-[120px]"
			/>
		</div>
	);
}
