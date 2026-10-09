import { Spin } from "antd";

export default function LoadingScreen({ label }: { label?: string }) {
	return (
		<div
			style={{
				minHeight: "60dvh",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: 16,
			}}
		>
			<Spin size="large" />
			{label && <span style={{ color: "var(--text-secondary)" }}>{label}</span>}
		</div>
	);
}
