import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "../layout/AppShell";
import LoadingScreen from "../components/LoadingScreen";
import RequireAuth from "./RequireAuth";
import { Paths } from "./paths";
import { useAppSelector } from "../store";

// Screens are code-split: guests landing on search never download the watchlist bundle
const loadSearch = () => import("../screens/SearchScreen");
const loadSearchInput = () => import("../screens/SearchScreen/SearchInputScreen");
const loadShowDetail = () => import("../screens/DetailScreens/ShowDetailScreen");
const loadHome = () => import("../screens/HomeScreen");
const loadCalendar = () => import("../screens/CalendarScreen");
const loadProfile = () => import("../screens/ProfileScreen");
const loadSettings = () => import("../screens/ProfileScreen/SettingsScreen");
const loadAppearance = () => import("../screens/ProfileScreen/AppearanceScreen");
const loadNotifications = () => import("../screens/ProfileScreen/NotificationsScreen");
const loadWatchHistory = () => import("../screens/ProfileScreen/WatchHistory");
const loadListDetail = () => import("../screens/ProfileScreen/ListDetail");
const loadLists = () => import("../screens/ProfileScreen/ListsScreen");

const LoginScreen = lazy(() => import("../screens/LoginScreen"));
const SearchScreen = lazy(loadSearch);
const SearchInputScreen = lazy(loadSearchInput);
const ShowDetailScreen = lazy(loadShowDetail);
const HomeScreen = lazy(loadHome);
const CalendarScreen = lazy(loadCalendar);
const ProfileScreen = lazy(loadProfile);
const SettingsScreen = lazy(loadSettings);
const AppearanceScreen = lazy(loadAppearance);
const NotificationsScreen = lazy(loadNotifications);
const WatchHistoryScreen = lazy(loadWatchHistory);
const ListDetailScreen = lazy(loadListDetail);
const ListsScreen = lazy(loadLists);
const ImportDataScreen = lazy(() => import("../screens/ImportDataScreen"));
const NotFoundScreen = lazy(() => import("../screens/NotFoundScreen"));

/** Pages a guest can browse; signed in, every tab / page that shows saved data too */
const GUEST_PAGES = [loadSearch, loadSearchInput, loadShowDetail];
const SIGNED_IN_PAGES = [
	...GUEST_PAGES,
	loadHome,
	loadCalendar,
	loadProfile,
	loadSettings,
	loadAppearance,
	loadNotifications,
	loadWatchHistory,
	loadLists,
	loadListDetail,
];
/** After launch has settled: fetching the other pages' code earlier would compete with it */
const PRELOAD_PAGES_DELAY_MS = 3000;

/**
 * Loads the browsable pages' code once the app is up, while it's online: a page whose chunk was
 * never fetched can't open offline (a failed dynamic import left a blank screen), and browsing
 * what's saved must work without a connection
 */
function usePreloadPages(signedIn: boolean) {
	useEffect(() => {
		const t = window.setTimeout(() => {
			for (const load of signedIn ? SIGNED_IN_PAGES : GUEST_PAGES) load().catch(() => {});
		}, PRELOAD_PAGES_DELAY_MS);
		return () => window.clearTimeout(t);
	}, [signedIn]);
}

/** Guests land on search; signed-in users on their watchlist */
function RootRedirect() {
	const { user, loading } = useAppSelector((s) => s.auth);
	if (loading) return <LoadingScreen splash />;
	return <Navigate to={user ? Paths.HOME : Paths.SEARCH} replace />;
}

export default function AppRoutes() {
	usePreloadPages(useAppSelector((s) => !!s.auth.user));
	return (
		<Suspense fallback={<LoadingScreen />}>
			<Routes>
				<Route path={Paths.LOGIN} element={<LoginScreen />} />
				<Route element={<AppShell />}>
					<Route path={Paths.ROOT} element={<RootRedirect />} />
					{/* Public: search + show info (read-only when logged out) */}
					<Route path={Paths.SEARCH} element={<SearchScreen />} />
					<Route path={Paths.SEARCH_INPUT} element={<SearchInputScreen />} />
					<Route path={Paths.SHOW} element={<ShowDetailScreen />} />
					{/* Signed-in only */}
					<Route element={<RequireAuth />}>
						<Route path={`${Paths.HOME}/*`} element={<HomeScreen />} />
						<Route path={Paths.CALENDAR} element={<CalendarScreen />} />
						<Route path={Paths.PROFILE} element={<ProfileScreen />} />
						<Route path={Paths.SETTINGS} element={<SettingsScreen />} />
						<Route path={Paths.APPEARANCE} element={<AppearanceScreen />} />
						<Route path={Paths.NOTIFICATIONS} element={<NotificationsScreen />} />
						<Route path={Paths.WATCH_HISTORY}element={<WatchHistoryScreen />} />
						<Route path={Paths.LISTS} element={<ListsScreen />} />
						<Route path={Paths.LIST} element={<ListDetailScreen />} />
						<Route path={Paths.IMPORT} element={<ImportDataScreen />} />
					</Route>
					<Route path="*" element={<NotFoundScreen />} />
				</Route>
			</Routes>
		</Suspense>
	);
}
