import React, { useEffect, useState } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { Image } from "expo-image";
import LoadingSpinner from "./src/components/LoadingSpinner";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import NetInfo from "@react-native-community/netinfo";
import { getAuth, onAuthStateChanged } from "@react-native-firebase/auth";
import messaging from "@react-native-firebase/messaging";
import {
  getFirestore,
  doc,
  setDoc,
} from "@react-native-firebase/firestore";
import { useAuthStore } from "./src/stores/authStore";
import { useForceUpdate } from "./src/hooks/useForceUpdate";
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

async function registerFCMToken(userId: string) {
  try {
    await messaging().requestPermission();
    const token = await messaging().getToken();
    const db = getFirestore();
    await setDoc(doc(db, "users", userId), { fcmToken: token }, { merge: true });
  } catch (err) {
    console.warn("FCM token registration failed:", err);
  }
}

function AppContent() {
  useForceUpdate();
  const { user, loading, setUser, appTmdbApiKey, appTmdbApiKeyLoading, hasCompletedImport } =
    useAuthStore();
  const setConnected = useUiStore((s) => s.setConnected);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(getAuth(), async (firebaseUser) => {
      if (firebaseUser) {
        // Verify user still exists by forcing token refresh
        try {
          await firebaseUser.reload();
        } catch {
          // User deleted server-side — sign out locally
          await getAuth().signOut();
          setUser(null);
          return;
        }
        registerFCMToken(firebaseUser.uid);
      }
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
    const markImportDone = () => {
      useAuthStore.setState({ hasCompletedImport: true });
      const uid = useAuthStore.getState().user?.uid;
      if (uid) {
        const db = getFirestore();
        setDoc(doc(db, "users", uid), { hasCompletedImport: true }, { merge: true }).catch(() => {});
      }
    };
    return (
      <ImportDataScreen
        navigation={{
          navigate: markImportDone,
          goBack: markImportDone,
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

function AppSplash() {
  const [visible, setVisible] = useState(true);
  const [opacity] = useState(() => new Animated.Value(1));
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    if (!loading) {
      // Fade out after a short delay
      const timer = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => setVisible(false));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [loading, opacity]);

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity, zIndex: 999 }]}>
      <Image
        source={require("./assets/splash.jpeg")}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
    </Animated.View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppContent />
          <AppSplash />
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
