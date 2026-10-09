// Web stand-in for @react-native-google-signin/google-signin. The web signs in
// with Firebase's Google popup (services/auth.ts); this only satisfies types.
export const GoogleSignin = {
	configure: (_options?: unknown) => {},
	hasPlayServices: async (_options?: unknown) => true,
	signIn: async (): Promise<{ data: { idToken: string | null } | null }> => {
		throw new Error("Native Google Sign-In is not available on web");
	},
	revokeAccess: async () => {},
	signOut: async () => {},
};
