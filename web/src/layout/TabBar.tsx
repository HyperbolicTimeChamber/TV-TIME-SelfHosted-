import { motion } from "motion/react";
import { NavLink, useLocation } from "react-router-dom";
import {
	IoCalendar,
	IoCalendarOutline,
	IoHome,
	IoHomeOutline,
	IoPerson,
	IoPersonOutline,
	IoSearch,
	IoSearchOutline,
} from "react-icons/io5";
import { colors } from "../theme";
import { Paths } from "../routes/paths";
import styles from "../styles/layout/TabBar.module.scss";

const TABS = [
	{ path: Paths.HOME, label: "Home", icon: IoHome, iconOutline: IoHomeOutline },
	{ path: Paths.CALENDAR, label: "Calendar", icon: IoCalendar, iconOutline: IoCalendarOutline },
	{ path: Paths.SEARCH, label: "Search", icon: IoSearch, iconOutline: IoSearchOutline },
	{ path: Paths.PROFILE, label: "Profile", icon: IoPerson, iconOutline: IoPersonOutline },
];

/** Bottom tab bar (mobile) / side rail (desktop) — mirrors app CustomTabBar */
export default function TabBar() {
	const { pathname } = useLocation();
	const activePath = TABS.find((t) => pathname.startsWith(t.path))?.path;

	return (
		<nav className={styles.bar} aria-label="Main">
			{TABS.map((tab) => {
				const active = tab.path === activePath;
				const Icon = active ? tab.icon : tab.iconOutline;
				return (
					<NavLink key={tab.path} to={tab.path} className={styles.tab} aria-label={tab.label}>
						{active && (
							<motion.span
								layoutId="tab-indicator"
								className={styles.indicator}
								transition={{ type: "spring", stiffness: 500, damping: 40 }}
							/>
						)}
						<Icon size={28} color={active ? colors.primary : colors.textMuted} />
						<span className={styles.label}>{tab.label}</span>
					</NavLink>
				);
			})}
		</nav>
	);
}
