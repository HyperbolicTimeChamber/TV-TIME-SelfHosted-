import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SearchStackParamList, Route } from "../types";
import { stackScreenOptions, swipeBackScreenOptions } from "./screenOptions";
import SearchScreen from "../screens/SearchScreen";
import SearchInputScreen from "../screens/SearchScreen/SearchInputScreen";
import ShowDetailScreen from "../screens/DetailScreens/ShowDetailScreen";

const SearchStack = createNativeStackNavigator<SearchStackParamList>();

export default function SearchStackScreen() {
	return (
		<SearchStack.Navigator screenOptions={stackScreenOptions}>
			<SearchStack.Screen
				name={Route.SEARCH_MAIN}
				component={SearchScreen}
				options={{ headerShown: false }}
			/>
			<SearchStack.Screen
				name={Route.SEARCH_INPUT}
				component={SearchInputScreen}
				options={{ headerShown: false, animation: "fade" }}
			/>
			<SearchStack.Screen
				name={Route.SEARCH_RESULTS}
				component={SearchScreen}
				// Swipe-back reveals Trending underneath
				options={swipeBackScreenOptions}
			/>
			<SearchStack.Screen
				name={Route.SHOW_DETAIL}
				component={ShowDetailScreen}
				options={swipeBackScreenOptions}
			/>
		</SearchStack.Navigator>
	);
}
