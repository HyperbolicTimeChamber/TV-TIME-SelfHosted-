import { useEffect } from "react";
import { motion } from "motion/react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Route as AppRoute } from "@app/enums";
import { useAppPrefsStore } from "@app/stores/appPrefsStore";
import WatchlistTab from "./WatchlistTab";
import UpcomingTab from "./UpcomingTab";
import { Paths } from "../../routes/paths";
import styles from "./styles/HomeScreen.module.scss";

/** Horizontal travel that switches tab (and it must clearly beat the vertical travel) */
const SWIPE_PX = 60;

const TABS = [
	{ to: Paths.HOME, label: "Watch List" },
	{ to: Paths.UPCOMING, label: "Upcoming" },
];

/** Reset by a reload: the start tab applies to a visit's first Home */
let homeOpened = false;

/** Home: Watch List / Upcoming top tabs (app material top tabs) */
export default function HomeScreen() {
	const { pathname } = useLocation();
	const active = pathname.startsWith(Paths.UPCOMING) ? Paths.UPCOMING : Paths.HOME;
	const navigate = useNavigate();
	// Settings -> Home: the tab a visit opens on, and returns to after the page was left
	const startTab = useAppPrefsStore((s) => s.prefs.homeTab);
	const startPath = startTab === AppRoute.UPCOMING ? Paths.UPCOMING : Paths.HOME;
	useEffect(() => {
		homeOpened = true;
	}, []);
	useEffect(() => {
		const onHide = () => {
			if (document.visibilityState !== "hidden" || active === startPath) return;
			navigate(startPath, { replace: true });
		};
		document.addEventListener("visibilitychange", onHide);
		return () => document.removeEventListener("visibilitychange", onHide);
	}, [active, startPath, navigate]);
	// Only from plain /home: a link straight to Upcoming stays where it points
	if (!homeOpened && pathname === Paths.HOME && startPath !== Paths.HOME) {
		return <Navigate to={startPath} replace />;
	}
	return (
		<div className={styles.container}>
			<nav className={styles.topTabs}>
				{TABS.map((t) => (
					<NavLink
						key={t.to}
						to={t.to}
						end
						className={`${styles.topTab} ${active === t.to ? styles.topTabActive : ""}`}
					>
						{t.label}
						{active === t.to && (
							<motion.span layoutId="home-tab" className={styles.topTabIndicator} />
						)}
					</NavLink>
				))}
			</nav>
			{/* Swipe between the tabs (app parity). Watch List cards only drag right, so a left
			    swipe there is always the tab's; Upcoming rows don't drag */}
			<motion.div
				className="touch-pan-y"
				onPanEnd={(_, info) => {
					const { x, y } = info.offset;
					if (Math.abs(x) < SWIPE_PX || Math.abs(x) < Math.abs(y) * 1.5) return;
					if (active === Paths.HOME && x < 0) navigate(Paths.UPCOMING);
					else if (active === Paths.UPCOMING && x > 0) navigate(Paths.HOME);
				}}
			>
				<Routes>
					<Route index element={<WatchlistTab />} />
					<Route path="upcoming" element={<UpcomingTab />} />
				</Routes>
			</motion.div>
		</div>
	);
}
