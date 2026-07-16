import { MediaType } from "../enums";

export type RootStackParamList = {
  Login: undefined;
  ImportData: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Calendar: undefined;
  Profile: undefined;
};

export type HomeTopTabParamList = {
  Watchlist: undefined;
  Upcoming: undefined;
};

export type HomeStackParamList = {
  HomeTabs: undefined;
  ShowDetail: { tmdbId: number; mediaType: MediaType };
  SeasonDetail: { tmdbId: number; seasonNumber: number; showTitle: string };
};

export type SearchStackParamList = {
  SearchMain: undefined;
  ShowDetail: { tmdbId: number; mediaType: MediaType };
};

export type CalendarStackParamList = {
  CalendarMain: undefined;
  ShowDetail: { tmdbId: number; mediaType: MediaType };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  ImportData: undefined;
};
