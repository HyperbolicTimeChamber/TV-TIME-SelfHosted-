import React from "react";
import {
	CommonActions,
	NavigationContainer,
	LinkingOptions,
	createNavigationContainerRef,
	getActionFromState,
	getStateFromPath,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../theme";
import { MainStackParamList, Route } from "../types";
import { MediaType, WEB_BASE_URL } from "../enums";
import HomeWithTabBar from "./HomeWithTabBar";
import SwipeTabsScreen from "./SwipeTabsScreen";

const Stack = createNativeStackNavigator<MainStackParamList>();

const navTheme = {
	dark: true,
	colors: {
		primary: colors.primary,
		background: colors.background,
		card: colors.background,
		text: colors.text,
		border: colors.border,
		notification: colors.primary,
	},
	fonts: {
		regular: { fontFamily: "System", fontWeight: "400" as const },
		medium: { fontFamily: "System", fontWeight: "500" as const },
		bold: { fontFamily: "System", fontWeight: "700" as const },
		heavy: { fontFamily: "System", fontWeight: "900" as const },
	},
};

const navigationRef = createNavigationContainerRef<MainStackParamList>();

const isValidTmdbId = (id: unknown): id is number => Number.isInteger(id) && (id as number) > 0;

/** Show page state on top of the watchlist; tmdbId 0 renders the not-found page */
const showDetailState = (tmdbId: number, mediaType: MediaType) => ({
	routes: [
		{
			name: Route.HOME,
			state: {
				routes: [{ name: Route.HOME_TABS }, { name: Route.SHOW_DETAIL, params: { tmdbId, mediaType } }],
			},
		},
	],
});

/** The ShowDetail params a parsed link points at, if any */
function linkedShow(state: ReturnType<typeof getStateFromPath>) {
	const home = state?.routes.find((r) => r.name === Route.HOME)?.state;
	const detail = home?.routes.find((r) => r.name === Route.SHOW_DETAIL);
	return detail?.params as { tmdbId: number; mediaType: MediaType } | undefined;
}

const linking: LinkingOptions<MainStackParamList> = {
	// Web share links open here too (Android App Links via assetlinks.json on the web app)
	prefixes: ["watchloom://", WEB_BASE_URL],
	config: {
		screens: {
			[Route.HOME]: {
				// Deep links open the show page on top of the watchlist, so back (header or
				// Android system back) returns to the watchlist instead of exiting the app
				initialRouteName: Route.HOME_TABS,
				screens: {
					[Route.SHOW_DETAIL]: {
						path: "show/:mediaType/:tmdbId",
						parse: {
							tmdbId: Number,
							mediaType: (val: string) =>
								val === "movie" ? MediaType.MOVIE : MediaType.TV,
						},
					},
				},
			},
		},
	},
	// Broken links (unknown path, bad id) open the not-found page instead of a bogus route
	getStateFromPath(path, options) {
		if (!path.replace(/^\/+|\/+$/g, "")) return undefined;
		const state = getStateFromPath(path, options);
		const show = linkedShow(state);
		if (show && isValidTmdbId(show.tmdbId)) return state;
		return showDetailState(0, show?.mediaType ?? MediaType.TV) as ReturnType<typeof getStateFromPath>;
	},
	// App already open on Calendar / Search / Profile → open the show inside that tab
	// (navigating to Home would push a second Home over the tabs)
	getActionFromState(state, options) {
		const show = linkedShow(state);
		const root = navigationRef.isReady() ? navigationRef.getRootState() : undefined;
		const focused = root?.routes[root.index];
		const tabState = focused?.name === Route.SWIPE_TABS ? focused.state : undefined;
		const tab = tabState?.routes[tabState.index ?? 0]?.name;
		if (show && tab && tab !== Route.HOME) {
			return CommonActions.navigate(Route.SWIPE_TABS, {
				screen: tab,
				params: { screen: Route.SHOW_DETAIL, params: show },
			});
		}
		return getActionFromState(state, options);
	},
};

export default function AppNavigator() {
	return (
		<NavigationContainer ref={navigationRef} theme={navTheme} linking={linking}>
			<Stack.Navigator
				screenOptions={{
					headerShown: false,
					animation: "none",
					contentStyle: { backgroundColor: colors.background },
				}}
			>
				<Stack.Screen name={Route.HOME} component={HomeWithTabBar} />
				<Stack.Screen name={Route.SWIPE_TABS} component={SwipeTabsScreen} />
			</Stack.Navigator>
		</NavigationContainer>
	);
}
