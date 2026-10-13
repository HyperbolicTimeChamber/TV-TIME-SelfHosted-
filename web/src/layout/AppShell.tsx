import { Outlet } from "react-router-dom";
import { useAppSelector } from "../store";
import TabBar from "./TabBar";
import styles from "./styles/AppShell.module.scss";

/** Page frame: tab bar for signed-in users; guests only get search + show pages */
export default function AppShell() {
	const signedIn = useAppSelector((s) => !!s.auth.user);
	const showTabs = useAppSelector((s) => signedIn && !s.ui.tabBarHidden);
	return (
		<div className={showTabs ? styles.withTabs : styles.guest}>
			<main className={styles.content}>
				<Outlet />
			</main>
			{showTabs && <TabBar />}
		</div>
	);
}
