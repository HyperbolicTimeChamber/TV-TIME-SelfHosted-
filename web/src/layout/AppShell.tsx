import { Outlet } from "react-router-dom";
import { useAppSelector } from "../store";
import TabBar from "./TabBar";
import styles from "./styles/AppShell.module.scss";

/** Page frame: tab bar for signed-in users; guests only get search + show pages */
export default function AppShell() {
	const signedIn = useAppSelector((s) => !!s.auth.user);
	const hidden = useAppSelector((s) => s.ui.tabBarHidden);
	const showTabs = signedIn && !hidden;
	return (
		<div className={showTabs ? styles.withTabs : styles.guest}>
			<main className={styles.content}>
				<Outlet />
			</main>
			{/* Kept mounted while signed in: a full-screen page slides it out of view instead of
			    popping it away (app SwipeTabsScreen) */}
			{signedIn && <TabBar hidden={hidden} />}
		</div>
	);
}
