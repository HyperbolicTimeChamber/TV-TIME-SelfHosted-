import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import NetInfo from "@react-native-community/netinfo";
import { getAuth, onAuthStateChanged } from "@react-native-firebase/auth";
import { useAuthStore } from "./src/stores/authStore";
import { useUiStore } from "./src/stores/uiStore";
import LoginScreen from "./src/screens/LoginScreen";
import ApiKeySetupScreen from "./src/screens/ApiKeySetupScreen";
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
  const { user, loading, setUser, tmdbApiKey, tmdbApiKeyLoading, loadTmdbApiKey, hasSeenImport, setHasSeenImport } =
    useAuthStore();
  const setConnected = useUiStore((s) => s.setConnected);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(getAuth(), (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        loadTmdbApiKey(firebaseUser.uid);
      }
    });
    return unsubscribeAuth;
  }, [setUser, loadTmdbApiKey]);

  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setConnected(state.isConnected ?? false);
    });
    return unsubscribeNet;
  }, [setConnected]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (tmdbApiKeyLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!tmdbApiKey) {
    return <ApiKeySetupScreen />;
  }

  if (!hasSeenImport) {
    return (
      <ImportDataScreen
        navigation={{
          navigate: () => setHasSeenImport(true),
          goBack: () => setHasSeenImport(true),
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
