import { Skeleton } from "antd";

const FILL = { display: "block", width: "100%", height: "100%", borderRadius: "inherit" } as const;

/**
 * Shimmering placeholder — antd's active Skeleton filling a box. The box's size, position and
 * radius come from `className` (no background / animation there: antd draws both).
 */
export default function SkeletonBlock({ className }: { className?: string }) {
	return (
		<div className={className} style={{ overflow: "hidden" }} aria-hidden>
			<Skeleton.Node active styles={{ root: FILL }} style={FILL} />
		</div>
	);
}
