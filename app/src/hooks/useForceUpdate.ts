import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import SpInAppUpdates, { IAUUpdateKind } from "sp-react-native-in-app-updates";
import { useAuthStore } from "../stores/authStore";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { expo } = require("../../app.json");
const appVersion: string = expo.version;

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const inAppUpdates = new SpInAppUpdates(false);

export function useForceUpdate() {
  const minVersion = useAuthStore((s) => s.minVersion);
  const user = useAuthStore((s) => s.user);
  const hasChecked = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "android" || !user || hasChecked.current) return;

    const checkUpdate = async () => {
      try {
        const result = await inAppUpdates.checkNeedsUpdate();
        if (!result.shouldUpdate) {
          hasChecked.current = true;
          return;
        }

        const forceImmediate =
          minVersion != null && compareVersions(appVersion, minVersion) < 0;

        await inAppUpdates.startUpdate({
          updateType: forceImmediate
            ? IAUUpdateKind.IMMEDIATE
            : IAUUpdateKind.FLEXIBLE,
        });
        hasChecked.current = true;
      } catch (error) {
        hasChecked.current = true;
        // Play Store not available (sideloaded) or other error
        if (minVersion != null && compareVersions(appVersion, minVersion) < 0) {
          Alert.alert(
            "Update Required",
            "Please update the app from the Google Play Store to continue.",
          );
        }
      }
    };

    checkUpdate();
  }, [minVersion, user]);
}
