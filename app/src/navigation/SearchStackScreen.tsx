import React from "react";
import { TouchableOpacity } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { SearchStackParamList, Route } from "../types";
import { stackScreenOptions } from "./screenOptions";
import { colors } from "../theme";
import { useNavigation } from "@react-navigation/native";
import SearchScreen from "../screens/SearchScreen";
import SearchInputScreen from "../screens/SearchScreen/SearchInputScreen";
import ShowDetailScreen from "../screens/DetailScreens/ShowDetailScreen";

const SearchStack = createNativeStackNavigator<SearchStackParamList>();

function BackToMain() {
	const navigation = useNavigation<any>();
	return (
		<TouchableOpacity
			onPress={() => navigation.navigate(Route.SEARCH_MAIN)}
			hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
			style={{ marginRight: 4 }}
		>
			<Ionicons name="chevron-back" size={26} color={colors.text} />
		</TouchableOpacity>
	);
}

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
				options={{ headerShown: false }}
			/>
			<SearchStack.Screen
				name={Route.SHOW_DETAIL}
				component={ShowDetailScreen}
				options={{ headerShown: false }}
			/>
		</SearchStack.Navigator>
	);
}
