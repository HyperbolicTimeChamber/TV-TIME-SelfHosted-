import { useNavigate } from "react-router-dom";
import { LoadErrorKind } from "@app/enums";
import ErrorState from "../components/ErrorState";
import { useAppSelector } from "../store";
import { Paths } from "../routes/paths";

/** Unknown URL */
export default function NotFoundScreen() {
	const navigate = useNavigate();
	const signedIn = useAppSelector((s) => !!s.auth.user);
	return (
		<ErrorState
			info={{
				kind: LoadErrorKind.NOT_FOUND,
				title: "This page doesn't exist",
				message: "The link may be broken or the page has moved.",
				canRetry: false,
				code: "404",
			}}
			primary={{ label: "Search Shows & Movies", onPress: () => navigate(Paths.SEARCH) }}
			secondary={signedIn ? { label: "Go to Watchlist", onPress: () => navigate(Paths.HOME) } : undefined}
		/>
	);
}
