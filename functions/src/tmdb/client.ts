import axios, { AxiosInstance } from "axios";
import { defineString } from "firebase-functions/params";

const tmdbApiKey = defineString("TMDB_API_KEY");

let _client: AxiosInstance | null = null;

export function getTmdbClient(): AxiosInstance {
  if (!_client) {
    _client = axios.create({
      baseURL: "https://api.themoviedb.org/3",
      params: { api_key: tmdbApiKey.value() },
    });
  }
  return _client;
}
