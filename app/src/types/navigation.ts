import type { NavigatorScreenParams } from "@react-navigation/native";
import { MediaType, Route } from "../enums";

export type RootStackParamList = {
	Login: undefined;
	ImportData: undefined;
	Main: undefined;
};

export type MainStackParamList = {
	SwipeTabs: NavigatorScreenParams<SwipeTabParamList> | undefined;
};

export type MainTabParamList = {
	Home: undefined;
	Search: undefined;
	Calendar: undefined;
	Profile: undefined;
};

export type SwipeTabParamList = {
	Home: NavigatorScreenParams<HomeStackParamList> | undefined;
	Calendar: undefined;
	Search: undefined;
	Profile: undefined;
};

export type HomeStackParamList = {
	/** screen: which Home tab to show (Watch List / Upcoming) */
	HomeTabs: { screen?: Route.WATCHLIST | Route.UPCOMING } | undefined;
	ShowDetail: { tmdbId: number; mediaType: MediaType };
	SeasonDetail: { tmdbId: number; seasonNumber: number; showTitle: string };
};

export type SearchStackParamList = {
	SearchMain: undefined;
	SearchInput: { currentQuery?: string } | undefined;
	SearchResults: { query: string };
	ShowDetail: { tmdbId: number; mediaType: MediaType };
};

export type CalendarStackParamList = {
	CalendarMain: undefined;
	ShowDetail: { tmdbId: number; mediaType: MediaType };
};

export type ProfileStackParamList = {
	ProfileMain: undefined;
	Settings: undefined;
	ImportData: undefined;
	WatchHistory: undefined;
	ListDetail: { listId: string };
	ShowDetail: { tmdbId: number; mediaType: MediaType };
};
