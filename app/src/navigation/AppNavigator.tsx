import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import {
  MainTabParamList,
  HomeStackParamList,
  SearchStackParamList,
  CalendarStackParamList,
} from "../types";
import HomeScreen from "../screens/HomeScreen";
import SearchScreen from "../screens/SearchScreen";
import CalendarScreen from "../screens/CalendarScreen";
import ProfileScreen from "../screens/ProfileScreen";
import ShowDetailScreen from "../screens/ShowDetailScreen";
import SeasonDetailScreen from "../screens/SeasonDetailScreen";

const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const SearchStack = createNativeStackNavigator<SearchStackParamList>();
const CalendarStack = createNativeStackNavigator<CalendarStackParamList>();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: "600" as const },
};

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen
        name="HomeTabs"
        component={HomeScreen}
        options={{ headerTitle: "TV Time" }}
      />
      <HomeStack.Screen
        name="ShowDetail"
        component={ShowDetailScreen}
        options={{ headerTitle: "" }}
      />
      <HomeStack.Screen
        name="SeasonDetail"
        component={SeasonDetailScreen}
        options={({ route }) => ({ headerTitle: route.params.showTitle })}
      />
    </HomeStack.Navigator>
  );
}

function SearchStackScreen() {
  return (
    <SearchStack.Navigator screenOptions={stackScreenOptions}>
      <SearchStack.Screen
        name="SearchMain"
        component={SearchScreen}
        options={{ headerTitle: "Search" }}
      />
      <SearchStack.Screen
        name="ShowDetail"
        component={ShowDetailScreen}
        options={{ headerTitle: "" }}
      />
    </SearchStack.Navigator>
  );
}

function CalendarStackScreen() {
  return (
    <CalendarStack.Navigator screenOptions={stackScreenOptions}>
      <CalendarStack.Screen
        name="CalendarMain"
        component={CalendarScreen}
        options={{ headerTitle: "Calendar" }}
      />
      <CalendarStack.Screen
        name="ShowDetail"
        component={ShowDetailScreen}
        options={{ headerTitle: "" }}
      />
    </CalendarStack.Navigator>
  );
}

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
              Home: "home",
              Search: "search",
              Calendar: "calendar",
              Profile: "person",
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
        <Tab.Screen name="Home" component={HomeStackScreen} />
        <Tab.Screen name="Search" component={SearchStackScreen} />
        <Tab.Screen name="Calendar" component={CalendarStackScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} options={{
          headerShown: true,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
        }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
