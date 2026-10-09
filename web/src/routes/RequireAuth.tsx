import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAppSelector } from "../store";
import { Paths } from "./paths";
import LoadingScreen from "../components/LoadingScreen";

/** Signed-in only routes (watchlist, calendar, profile…) → login, then back */
export default function RequireAuth() {
	const { user, loading } = useAppSelector((s) => s.auth);
	const location = useLocation();
	if (loading) return <LoadingScreen />;
	if (!user) {
		const next = encodeURIComponent(location.pathname + location.search);
		return <Navigate to={`${Paths.LOGIN}?next=${next}`} replace />;
	}
	return <Outlet />;
}
