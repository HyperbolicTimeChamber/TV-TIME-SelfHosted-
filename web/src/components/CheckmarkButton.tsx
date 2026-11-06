import { HiCheck } from "react-icons/hi";
import { Spin } from "antd";
import { colors } from "../theme/index";
import { useLongPress } from "../hooks/useLongPress";
import { cssVars, px } from "../utils/cssVars";

interface Props {
	watched?: boolean;
	loading?: boolean;
	size?: number;
	/** Tick size override (default size * 0.72) */
	checkSize?: number;
	label?: string;
	labelColor?: string;
	backgroundColor?: string;
	onPress?: () => void;
	onLongPress?: () => void;
	disabled?: boolean;
	ariaLabel?: string;
}

/** Round watched toggle — white (unwatched) / green (watched) / count label */
/** Watchlist cards' checkmark: circle + tick (3px under the default tick) */
export const WATCHLIST_CHECK_CIRCLE = 38;
export const WATCHLIST_CHECK_TICK = WATCHLIST_CHECK_CIRCLE * 0.72 - 3;

export default function CheckmarkButton({
	watched,
	loading,
	size = 30,
	checkSize,
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
	const iconColor = watched ? colors.text : colors.checkTick;
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
			className={`flex size-(--size) shrink-0 touch-manipulation items-center justify-center rounded-full border-0 bg-(--bg) p-0 ${disabled ? "cursor-default" : "cursor-pointer"} ${loading ? "opacity-50" : ""}`}
			style={cssVars({
				"--size": px(size),
				"--bg": bg,
				"--label-fs": px(size * 0.38),
				"--label-c": textColor,
			})}
		>
			{loading ? (
				<Spin size="small" />
			) : label ? (
				<span className="text-(length:--label-fs) font-bold text-(--label-c)">{label}</span>
			) : (
				<HiCheck size={checkSize ?? size * 0.72} color={iconColor} />
			)}
		</button>
	);
}
