import React from "react";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { colors } from "../theme";
import { HomeTopTabParamList } from "../types";
import WatchlistTab from "./WatchlistTab";
import UpcomingTab from "./UpcomingTab";

const TopTab = createMaterialTopTabNavigator<HomeTopTabParamList>();

export default function HomeScreen() {
  return (
    <TopTab.Navigator
      screenOptions={{
        tabBarStyle: { backgroundColor: colors.surface },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarIndicatorStyle: { backgroundColor: colors.primary },
        tabBarLabelStyle: { fontWeight: "600", fontSize: 14 },
      }}
    >
      <TopTab.Screen name="Watchlist" component={WatchlistTab} />
      <TopTab.Screen name="Upcoming" component={UpcomingTab} />
    </TopTab.Navigator>
  );
}
