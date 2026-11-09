import axios from "axios";
import { MediaType, TMDB_BASE } from "../../shared/enums";
import type { TmdbRegionProviders } from "../watchProviders";
import type { TmdbCastMember, TmdbCrewMember, TmdbReleaseDates } from "./normalize";

export interface TmdbTitleBundle {
  number_of_episodes?: number;
  networks?: { id: number; name: string; logo_path: string | null }[];
  production_companies?: { id: number; name: string; logo_path: string | null }[];
  credits?: { cast?: TmdbCastMember[]; crew?: TmdbCrewMember[] };
  aggregate_credits?: { cast?: TmdbCastMember[] };
  "watch/providers"?: { results?: Record<string, TmdbRegionProviders> };
  release_dates?: { results?: TmdbReleaseDates[] };
}

/**
 * A title's details with its credits (a show's across every season), watch providers and / or a
 * movie's release dates appended — everything the info page extras need in one TMDB request
 */
export async function fetchTitleBundle(
  apiKey: string,
  tmdbId: number,
  mediaType: MediaType,
  want: { credits: boolean; providers: boolean; release?: boolean },
): Promise<TmdbTitleBundle> {
  const append = [
    ...(want.credits ? [mediaType === MediaType.TV ? "aggregate_credits" : "credits"] : []),
    ...(want.providers ? ["watch/providers"] : []),
    ...(want.release && mediaType === MediaType.MOVIE ? ["release_dates"] : []),
  ];
  const { data } = await axios.get<TmdbTitleBundle>(`${TMDB_BASE}/${mediaType}/${tmdbId}`, {
    params: { api_key: apiKey, ...(append.length ? { append_to_response: append.join(",") } : {}) },
    timeout: 10000,
  });
  return data;
}
