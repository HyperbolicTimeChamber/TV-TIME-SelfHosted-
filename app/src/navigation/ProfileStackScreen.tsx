import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ProfileStackParamList, Route } from "../types";
import { stackScreenOptions } from "./screenOptions";
import ProfileScreen from "../screens/ProfileScreen";
import ImportDataScreen from "../screens/ImportDataScreen";

const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen
        name={Route.PROFILE_MAIN}
        component={ProfileScreen}
        options={{ headerTitle: "Profile" }}
      />
      <ProfileStack.Screen
        name={Route.IMPORT_DATA}
        component={ImportDataScreen}
        options={{ headerTitle: "Import Data" }}
      />
    </ProfileStack.Navigator>
  );
}
