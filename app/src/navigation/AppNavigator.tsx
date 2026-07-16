import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { MainTabParamList, Route } from "../types";
import HomeStackScreen from "./HomeStackScreen";
import SearchStackScreen from "./SearchStackScreen";
import CalendarStackScreen from "./CalendarStackScreen";
import ProfileStackScreen from "./ProfileStackScreen";

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarIcon: ({ color, size }) => {
            const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
              [Route.HOME]: "home",
              [Route.SEARCH]: "search",
              [Route.CALENDAR]: "calendar",
              [Route.PROFILE]: "person",
            };
            return (
              <Ionicons
                name={icons[route.name] || "ellipse"}
                size={size}
                color={color}
              />
            );
          },
        })}
      >
        <Tab.Screen name={Route.HOME} component={HomeStackScreen} />
        <Tab.Screen name={Route.SEARCH} component={SearchStackScreen} />
        <Tab.Screen name={Route.CALENDAR} component={CalendarStackScreen} />
        <Tab.Screen name={Route.PROFILE} component={ProfileStackScreen} options={{
          headerShown: false,
        }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
