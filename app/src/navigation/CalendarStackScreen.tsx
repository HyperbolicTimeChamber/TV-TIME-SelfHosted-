import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { CalendarStackParamList, Route } from "../types";
import { stackScreenOptions } from "./screenOptions";
import CalendarScreen from "../screens/CalendarScreen";
import ShowDetailScreen from "../screens/ShowDetailScreen";

const CalendarStack = createNativeStackNavigator<CalendarStackParamList>();

export default function CalendarStackScreen() {
	return (
		<CalendarStack.Navigator screenOptions={stackScreenOptions}>
			<CalendarStack.Screen
				name={Route.CALENDAR_MAIN}
				component={CalendarScreen}
				options={{ headerTitle: "Calendar" }}
			/>
			<CalendarStack.Screen
				name={Route.SHOW_DETAIL}
				component={ShowDetailScreen}
				options={{ headerTitle: "" }}
			/>
		</CalendarStack.Navigator>
	);
}
