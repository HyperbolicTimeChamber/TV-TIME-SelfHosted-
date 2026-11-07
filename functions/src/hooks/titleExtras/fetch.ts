import axios from "axios";
import { MediaType, TMDB_BASE } from "../../shared/enums";
import type { TmdbRegionProviders } from "../watchProviders";
import type { TmdbCastMember, TmdbCrewMember } from "./normalize";

export interface TmdbTitleBundle {
  number_of_episodes?: number;
  networks?: { id: number; name: string; logo_path: string | null }[];
  production_companies?: { id: number; name: string; logo_path: string | null }[];
  credits?: { cast?: TmdbCastMember[]; crew?: TmdbCrewMember[] };
  aggregate_credits?: { cast?: TmdbCastMember[] };
  "watch/providers"?: { results?: Record<string, TmdbRegionProviders> };
}

/**
 * A title's details with its credits (a show's across every season) and / or its watch providers
 * appended — everything the info page extras need in one TMDB request
 */
export async function fetchTitleBundle(
  apiKey: string,
  tmdbId: number,
  mediaType: MediaType,
  want: { credits: boolean; providers: boolean },
): Promise<TmdbTitleBundle> {
  const append = [
    ...(want.credits ? [mediaType === MediaType.TV ? "aggregate_credits" : "credits"] : []),
    ...(want.providers ? ["watch/providers"] : []),
  ];
  const { data } = await axios.get<TmdbTitleBundle>(`${TMDB_BASE}/${mediaType}/${tmdbId}`, {
    params: { api_key: apiKey, ...(append.length ? { append_to_response: append.join(",") } : {}) },
    timeout: 10000,
  });
  return data;
}
