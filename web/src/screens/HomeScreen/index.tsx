import { motion } from "motion/react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import WatchlistTab from "./WatchlistTab";
import UpcomingTab from "./UpcomingTab";
import { Paths } from "../../routes/paths";
import styles from "../../styles/screens/HomeScreen/HomeScreen.module.scss";

const TABS = [
	{ to: Paths.HOME, label: "Watch List" },
	{ to: Paths.UPCOMING, label: "Upcoming" },
];

/** Home: Watch List / Upcoming top tabs (app material top tabs) */
export default function HomeScreen() {
	const { pathname } = useLocation();
	const active = pathname.startsWith(Paths.UPCOMING) ? Paths.UPCOMING : Paths.HOME;
	return (
		<div className={styles.container}>
			<nav className={styles.topTabs}>
				{TABS.map((t) => (
					<NavLink key={t.to} to={t.to} end className={`${styles.topTab} ${active === t.to ? styles.topTabActive : ""}`}>
						{t.label}
						{active === t.to && <motion.span layoutId="home-tab" className={styles.topTabIndicator} />}
					</NavLink>
				))}
			</nav>
			<Routes>
				<Route index element={<WatchlistTab />} />
				<Route path="upcoming" element={<UpcomingTab />} />
			</Routes>
		</div>
	);
}
