import React, { useEffect, useState } from "react";
import { View, StyleSheet, Animated, Platform, PermissionsAndroid } from "react-native";
import { Image } from "expo-image";
import LoadingSpinner from "./src/components/LoadingSpinner";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import NetInfo from "@react-native-community/netinfo";
import { getAuth, onAuthStateChanged, reload, signOut } from "@react-native-firebase/auth";
import {
  getMessaging,
  getToken,
  requestPermission,
} from "@react-native-firebase/messaging";
import {
  getFirestore,
  doc,
  setDoc,
} from "@react-native-firebase/firestore";
import { useAuthStore, useUiStore } from "./src/stores";
import { useForceUpdate } from "./src/hooks";
import LoginScreen from "./src/screens/LoginScreen";
import ImportDataScreen from "./src/screens/ImportDataScreen";
import AppNavigator from "./src/navigation/AppNavigator";
import { OfflineOverlay } from "./src/components";
import { colors } from "./src/theme";

GoogleSignin.configure({
  webClientId: "805605757351-l3oi0shjpalvspqoq1reve1otviuqvnu.apps.googleusercontent.com",
  offlineAccess: true,
  forceCodeForRefreshToken: true,
});

const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 2 },
  },
});

const PERSIST_PREFIXES = ["upcomingEpisodes", "catalog"];

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "tv-time-cache",
});


async function registerFCMToken(userId: string) {
  try {
    if (Platform.OS === "android" && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.warn("POST_NOTIFICATIONS permission denied");
        return;
      }
    }
    const msg = getMessaging();
    await requestPermission(msg);
    const token = await getToken(msg);
    const db = getFirestore();
    await setDoc(doc(db, "users", userId), { fcmToken: token }, { merge: true });
  } catch (err) {
    console.warn("FCM token registration failed:", err);
  }
}

function AppContent() {
  useForceUpdate();
  const { user, appTmdbApiKey, appTmdbApiKeyLoading, userFlagsLoading, hasCompletedImport } =
    useAuthStore();

  if (!user) {
    return <LoginScreen />;
  }

  if (appTmdbApiKeyLoading || userFlagsLoading) {
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

function AppSplash({ onHidden }: { onHidden: () => void }) {
  const [opacity] = useState(() => new Animated.Value(1));
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => onHidden());
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, opacity, onHidden]);

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
  const [splashDone, setSplashDone] = useState(false);
  const onHidden = React.useCallback(() => setSplashDone(true), []);
  const setUser = useAuthStore((s) => s.setUser);
  const setConnected = useUiStore((s) => s.setConnected);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(getAuth(), async (firebaseUser) => {
      if (firebaseUser) {
        try {
          await reload(firebaseUser);
        } catch {
          await signOut(getAuth());
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: asyncStoragePersister,
            maxAge: ONE_WEEK,
            dehydrateOptions: {
              shouldDehydrateQuery: (q) => {
                const key = q.queryKey[0] as string;
                return PERSIST_PREFIXES.includes(key) && q.state.status === "success";
              },
            },
          }}
        >
          {splashDone ? <AppContent /> : <View style={styles.loading} />}
          {!splashDone && <AppSplash onHidden={onHidden} />}
        </PersistQueryClientProvider>
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
