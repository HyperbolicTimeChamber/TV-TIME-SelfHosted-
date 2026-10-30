import { connectAuthEmulator, getAuth } from "@react-native-firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "@react-native-firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "@react-native-firebase/functions";
import { EmulatorPort } from "../enums";

/**
 * EXPO_PUBLIC_USE_EMULATORS=true (dev builds only) → Auth / Firestore / Functions go to the
 * local Emulator Suite (`firebase emulators:start`) instead of production. Development on the
 * real account re-reads tens of thousands of docs a day (≈ the whole Firestore bill).
 * Android emulator reaches the host through `adb reverse tcp:<port> tcp:<port>` for each port.
 */
export function connectEmulators() {
	if (!__DEV__ || process.env.EXPO_PUBLIC_USE_EMULATORS !== "true") return;
	const host = "localhost";
	connectAuthEmulator(getAuth(), `http://${host}:${EmulatorPort.AUTH}`);
	connectFirestoreEmulator(getFirestore(), host, EmulatorPort.FIRESTORE);
	connectFunctionsEmulator(getFunctions(), host, EmulatorPort.FUNCTIONS);
	console.warn("[emulators] using the local Firebase Emulator Suite — not production data");
}
