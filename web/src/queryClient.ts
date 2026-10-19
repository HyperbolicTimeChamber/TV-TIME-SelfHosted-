import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";

// Same caching strategy as the mobile app (app/App.tsx)
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000,
			retry: 2,
			// React Native never refetches on "focus"; browsers would, flashing the loader
			// every time you return to the tab
			refetchOnWindowFocus: false,
		},
	},
});

const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
const PERSIST_PREFIXES = ["upcomingEpisodes", "catalog"];

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
	persister: createSyncStoragePersister({ storage: window.localStorage, key: "tv-time-cache" }),
	maxAge: ONE_WEEK,
	dehydrateOptions: {
		shouldDehydrateQuery: (q) =>
			PERSIST_PREFIXES.includes(q.queryKey[0] as string) && q.state.status === "success",
	},
};
