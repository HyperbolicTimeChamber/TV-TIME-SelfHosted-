import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SearchStackParamList, Route } from "../types";
import { stackScreenOptions } from "./screenOptions";
import SearchScreen from "../screens/SearchScreen";
import ShowDetailScreen from "../screens/ShowDetailScreen";

const SearchStack = createNativeStackNavigator<SearchStackParamList>();

export default function SearchStackScreen() {
  return (
    <SearchStack.Navigator screenOptions={stackScreenOptions}>
      <SearchStack.Screen
        name={Route.SEARCH_MAIN}
        component={SearchScreen}
        options={{ headerTitle: "Search" }}
      />
      <SearchStack.Screen
        name={Route.SHOW_DETAIL}
        component={ShowDetailScreen}
        options={{ headerTitle: "" }}
      />
    </SearchStack.Navigator>
  );
}
