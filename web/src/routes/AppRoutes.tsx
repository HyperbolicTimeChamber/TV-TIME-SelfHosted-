import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "../layout/AppShell";
import LoadingScreen from "../components/LoadingScreen";
import RequireAuth from "./RequireAuth";
import { Paths } from "./paths";
import { useAppSelector } from "../store";

// Screens are code-split: guests landing on search never download the watchlist bundle
const LoginScreen = lazy(() => import("../screens/LoginScreen"));
const SearchScreen = lazy(() => import("../screens/SearchScreen"));
const SearchInputScreen = lazy(() => import("../screens/SearchScreen/SearchInputScreen"));
const ShowDetailScreen = lazy(() => import("../screens/DetailScreens/ShowDetailScreen"));
const HomeScreen = lazy(() => import("../screens/HomeScreen"));
const CalendarScreen = lazy(() => import("../screens/CalendarScreen"));
const ProfileScreen = lazy(() => import("../screens/ProfileScreen"));
const SettingsScreen = lazy(() => import("../screens/ProfileScreen/SettingsScreen"));
const WatchHistoryScreen = lazy(() => import("../screens/ProfileScreen/WatchHistory"));
const ListDetailScreen = lazy(() => import("../screens/ProfileScreen/ListDetail"));
const ImportDataScreen = lazy(() => import("../screens/ImportDataScreen"));
const NotFoundScreen = lazy(() => import("../screens/NotFoundScreen"));

/** Guests land on search; signed-in users on their watchlist */
function RootRedirect() {
	const { user, loading } = useAppSelector((s) => s.auth);
	if (loading) return <LoadingScreen />;
	return <Navigate to={user ? Paths.HOME : Paths.SEARCH} replace />;
}

export default function AppRoutes() {
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
						<Route path={Paths.WATCH_HISTORY} element={<WatchHistoryScreen />} />
						<Route path={Paths.LIST} element={<ListDetailScreen />} />
						<Route path={Paths.IMPORT} element={<ImportDataScreen />} />
					</Route>
					<Route path="*" element={<NotFoundScreen />} />
				</Route>
			</Routes>
		</Suspense>
	);
}
