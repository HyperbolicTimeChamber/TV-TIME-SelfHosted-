import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ProfileStackParamList, Route } from "../types";
import { stackScreenOptions } from "./screenOptions";
import ProfileScreen from "../screens/ProfileScreen";
import SettingsScreen from "../screens/ProfileScreen/SettingsScreen";
import ImportDataScreen from "../screens/ImportDataScreen";
import ShowDetailScreen from "../screens/DetailScreens/ShowDetailScreen";

const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStackScreen() {
	return (
		<ProfileStack.Navigator screenOptions={stackScreenOptions}>
			<ProfileStack.Screen
				name={Route.PROFILE_MAIN}
				component={ProfileScreen}
				options={{ headerShown: false }}
			/>
			<ProfileStack.Screen
				name={Route.SETTINGS}
				component={SettingsScreen}
				options={{ headerShown: false }}
			/>
			<ProfileStack.Screen
				name={Route.IMPORT_DATA}
				component={ImportDataScreen}
				options={{ headerTitle: "Import Data" }}
			/>
			<ProfileStack.Screen
				name={Route.SHOW_DETAIL}
				component={ShowDetailScreen}
				options={{ headerShown: false }}
			/>
		</ProfileStack.Navigator>
	);
}
