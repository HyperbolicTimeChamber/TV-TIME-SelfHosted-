import axios from "axios";
import { MediaType, TMDB_BASE } from "../../shared/enums";
import type { TmdbRegionProviders } from "./normalize";

/** Every country's offers for a title — one TMDB request covers all of them */
export async function fetchTmdbWatchProviders(
  apiKey: string,
  tmdbId: number,
  mediaType: MediaType,
): Promise<Record<string, TmdbRegionProviders>> {
  const { data } = await axios.get(
    `${TMDB_BASE}/${mediaType}/${tmdbId}/watch/providers`,
    { params: { api_key: apiKey }, timeout: 10000 },
  );
  return data?.results ?? {};
}
