import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeStackParamList, Route } from "../types";
import { stackScreenOptions } from "./screenOptions";
import HomeScreen from "../screens/HomeScreen";
import ShowDetailScreen from "../screens/ShowDetailScreen";
import SeasonDetailScreen from "../screens/SeasonDetailScreen";

const HomeStack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStackScreen() {
	return (
		<HomeStack.Navigator screenOptions={stackScreenOptions}>
			<HomeStack.Screen
				name={Route.HOME_TABS}
				component={HomeScreen}
				options={{ headerTitle: "Watchloom" }}
			/>
			<HomeStack.Screen
				name={Route.SHOW_DETAIL}
				component={ShowDetailScreen}
				options={{ headerTitle: "" }}
			/>
			<HomeStack.Screen
				name={Route.SEASON_DETAIL}
				component={SeasonDetailScreen}
				options={({ route }) => ({ headerTitle: route.params.showTitle })}
			/>
		</HomeStack.Navigator>
	);
}
