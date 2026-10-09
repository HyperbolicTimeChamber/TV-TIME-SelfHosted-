import { Outlet } from "react-router-dom";
import { useAppSelector } from "../store";
import TabBar from "./TabBar";
import styles from "./AppShell.module.css";

/** Page frame: tab bar for signed-in users; guests only get search + show pages */
export default function AppShell() {
	const signedIn = useAppSelector((s) => !!s.auth.user);
	return (
		<div className={signedIn ? styles.withTabs : styles.guest}>
			<main className={styles.content}>
				<Outlet />
			</main>
			{signedIn && <TabBar />}
		</div>
	);
}
