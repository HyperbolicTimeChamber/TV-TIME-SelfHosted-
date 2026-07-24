import React, { useRef } from "react";
import {
  NavigationContainer,
  NavigationContainerRef,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions } from "@react-navigation/native";
import { colors } from "../theme";
import { MainTabParamList, Route } from "../types";
import HomeStackScreen from "./HomeStackScreen";
import SearchStackScreen from "./SearchStackScreen";
import CalendarStackScreen from "./CalendarStackScreen";
import ProfileStackScreen from "./ProfileStackScreen";

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function AppNavigator() {
  const navRef = useRef<NavigationContainerRef<MainTabParamList>>(null);

  return (
    <NavigationContainer ref={navRef}>
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
        <Tab.Screen
          name={Route.HOME}
          component={HomeStackScreen}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              navRef.current?.dispatch(
                CommonActions.navigate({
                  name: Route.HOME,
                  params: {
                    screen: Route.HOME_TABS,
                    params: { screen: Route.WATCHLIST },
                  },
                }),
              );
            },
          }}
        />
        <Tab.Screen
          name={Route.CALENDAR}
          component={CalendarStackScreen}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              navRef.current?.dispatch(
                CommonActions.navigate({
                  name: Route.CALENDAR,
                  params: { screen: Route.CALENDAR_MAIN },
                }),
              );
            },
          }}
        />
        <Tab.Screen
          name={Route.SEARCH}
          component={SearchStackScreen}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              navRef.current?.dispatch(
                CommonActions.navigate({
                  name: Route.SEARCH,
                  params: { screen: Route.SEARCH_MAIN },
                }),
              );
            },
          }}
        />
        <Tab.Screen
          name={Route.PROFILE}
          component={ProfileStackScreen}
          options={{
            headerShown: false,
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              navRef.current?.dispatch(
                CommonActions.navigate({
                  name: Route.PROFILE,
                  params: { screen: Route.PROFILE_MAIN },
                }),
              );
            },
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
