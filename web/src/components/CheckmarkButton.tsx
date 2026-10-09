import { Spin } from "antd";
import { IoCheckmark } from "react-icons/io5";
import { colors } from "../theme";
import { useLongPress } from "../hooks/useLongPress";

interface Props {
	watched?: boolean;
	loading?: boolean;
	size?: number;
	label?: string;
	labelColor?: string;
	backgroundColor?: string;
	onPress?: () => void;
	onLongPress?: () => void;
	disabled?: boolean;
	ariaLabel?: string;
}

/** Round watched toggle — white (unwatched) / green (watched) / count label */
export default function CheckmarkButton({
	watched,
	loading,
	size = 30,
	label,
	labelColor,
	backgroundColor,
	onPress,
	onLongPress,
	disabled,
	ariaLabel,
}: Props) {
	const iconSize = size * 0.55;
	const bg = backgroundColor ?? (watched ? colors.watchedGreen : colors.text);
	const iconColor = watched ? colors.text : colors.textMuted;
	const textColor = labelColor ?? (watched ? colors.text : colors.background);
	const press = useLongPress(
		disabled || loading ? undefined : onLongPress,
		disabled || loading ? undefined : onPress,
	);

	return (
		<button
			type="button"
			aria-label={ariaLabel ?? (watched ? "Watched" : "Mark watched")}
			disabled={disabled || loading}
			{...press}
			onClick={(e) => {
				e.stopPropagation();
				press.onClick(e);
			}}
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				background: bg,
				border: "none",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				flexShrink: 0,
				padding: 0,
				cursor: disabled ? "default" : "pointer",
				opacity: loading ? 0.5 : 1,
				touchAction: "manipulation",
			}}
		>
			{loading ? (
				<Spin size="small" />
			) : label ? (
				<span style={{ fontWeight: 700, fontSize: size * 0.38, color: textColor }}>{label}</span>
			) : (
				<IoCheckmark size={iconSize} color={iconColor} />
			)}
		</button>
	);
}
