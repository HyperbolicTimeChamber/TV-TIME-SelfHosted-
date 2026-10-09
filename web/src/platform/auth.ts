// Web stand-in for @react-native-firebase/auth. The web uses its own auth flow
// (services/auth.ts); this exists so app/src/stores/authStore.ts — which Vite
// replaces with platform/stores.ts — still type-checks.
import "../firebase";

export * from "firebase/auth";
