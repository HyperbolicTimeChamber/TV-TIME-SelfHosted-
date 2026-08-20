import React from "react";
import { NavigationContainer, LinkingOptions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../theme";
import { MainStackParamList, Route } from "../types";
import { MediaType } from "../enums";
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

const linking: LinkingOptions<MainStackParamList> = {
	prefixes: ["watchloom://"],
	config: {
		screens: {
			[Route.HOME]: {
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
};

export default function AppNavigator() {
	return (
		<NavigationContainer theme={navTheme} linking={linking}>
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
