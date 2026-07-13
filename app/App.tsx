import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import LoadingSpinner from "./src/components/LoadingSpinner";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import NetInfo from "@react-native-community/netinfo";
import { getAuth, onAuthStateChanged } from "@react-native-firebase/auth";
import { useAuthStore } from "./src/stores/authStore";
import { useUiStore } from "./src/stores/uiStore";
import LoginScreen from "./src/screens/LoginScreen";
import ImportDataScreen from "./src/screens/ImportDataScreen";
import AppNavigator from "./src/navigation/AppNavigator";
import OfflineOverlay from "./src/components/OfflineOverlay";
import { colors } from "./src/theme";

GoogleSignin.configure({
  webClientId: "805605757351-l3oi0shjpalvspqoq1reve1otviuqvnu.apps.googleusercontent.com",
  offlineAccess: true,
  forceCodeForRefreshToken: true,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 2 },
  },
});

function AppContent() {
  const { user, loading, setUser, appTmdbApiKey, appTmdbApiKeyLoading, hasCompletedImport } =
    useAuthStore();
  const setConnected = useUiStore((s) => s.setConnected);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(getAuth(), (firebaseUser) => {
      setUser(firebaseUser);
    });
    return unsubscribeAuth;
  }, [setUser]);

  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setConnected(state.isConnected ?? false);
    });
    return unsubscribeNet;
  }, [setConnected]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <LoadingSpinner />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (appTmdbApiKeyLoading) {
    return (
      <View style={styles.loading}>
        <LoadingSpinner />
      </View>
    );
  }

  if (!hasCompletedImport) {
    return (
      <ImportDataScreen
        navigation={{
          navigate: () => { useAuthStore.setState({ hasCompletedImport: true }); },
          goBack: () => { useAuthStore.setState({ hasCompletedImport: true }); },
        }}
      />
    );
  }

  return (
    <>
      <AppNavigator />
      <OfflineOverlay />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppContent />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
