import { Spin } from "antd";
import { IoCloudDownloadOutline } from "react-icons/io5";
import { CalendarDayAction } from "@app/utils/calendarRange";
import styles from "./styles/CalendarScreen.module.scss";

/**
 * A date outside what Settings -> Calendar loads (app DayLoad): nothing downloaded for it yet (LOAD),
 * or an older saved copy (REFRESH, a button under its cards)
 */
export default function DayLoad({
	action,
	loading,
	month,
	onLoad,
}: {
	action: CalendarDayAction;
	loading: boolean;
	/** The date's month, as shown on the button */
	month: string;
	onLoad: () => void;
}) {
	const refresh = action === CalendarDayAction.REFRESH;
	const label = refresh ? `Update ${month}` : `Load ${month}`;
	return (
		<div className={refresh ? styles.updateDay : styles.notLoaded}>
			{!refresh && (
				<>
					<IoCloudDownloadOutline size={44} aria-hidden />
					<p className={styles.emptyDayTitle}>This date isn't loaded.</p>
					<p className={styles.emptyDayTagline}>It's outside the days set in Settings, Calendar.</p>
				</>
			)}
			<button
				type="button"
				className={styles.loadButton}
				onClick={onLoad}
				disabled={loading}
				aria-label={label}
				aria-busy={loading}
			>
				{loading ? <Spin size="small" /> : label}
			</button>
		</div>
	);
}
