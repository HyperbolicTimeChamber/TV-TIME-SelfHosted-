import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { EmulatorPort } from "@app/enums";
import { firebaseApp } from "./firebase";

/**
 * VITE_USE_EMULATORS=true (dev server only) → Auth / Firestore / Functions go to the local
 * Emulator Suite (`firebase emulators:start`) instead of production — app connectEmulators.
 */
export function connectEmulators() {
	if (!import.meta.env.DEV || import.meta.env.VITE_USE_EMULATORS !== "true") return;
	const host = "127.0.0.1";
	connectAuthEmulator(getAuth(firebaseApp), `http://${host}:${EmulatorPort.AUTH}`, {
		disableWarnings: true,
	});
	connectFirestoreEmulator(getFirestore(firebaseApp), host, EmulatorPort.FIRESTORE);
	connectFunctionsEmulator(getFunctions(firebaseApp), host, EmulatorPort.FUNCTIONS);
	console.warn("[emulators] using the local Firebase Emulator Suite — not production data");
}
