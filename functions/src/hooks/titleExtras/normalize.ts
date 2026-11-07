import {
  FEATURED_CAST_FALLBACK,
  FEATURED_CAST_MAX,
  FULL_CAST_MAX,
  MediaType,
  MOVIE_LEADS,
  TV_REGULAR_MIN_EPISODES,
  TV_REGULAR_SHARE,
  WRITERS_MAX,
} from "../../shared/enums";
import type {
  StoredCastMember,
  StoredCrewMember,
  StoredStudio,
} from "../../shared/types";

export interface TmdbCastMember {
  id: number;
  name: string;
  profile_path: string | null;
  order?: number;
  /** Movies */
  character?: string;
  /** Shows (aggregate_credits): every part they played, with episode counts */
  roles?: { character: string; episode_count: number }[];
  total_episode_count?: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job?: string;
  department?: string;
  profile_path: string | null;
}

interface TmdbCompany {
  id: number;
  name: string;
  logo_path: string | null;
}

/** A show's part: the one they played in the most episodes */
function showCharacter(m: TmdbCastMember): string | null {
  const roles = [...(m.roles ?? [])].sort((a, b) => b.episode_count - a.episode_count);
  return roles[0]?.character || null;
}

/** The whole cast as stored: billing order (a show's: most episodes first), capped */
export function normalizeCast(
  cast: TmdbCastMember[] | undefined,
  mediaType: MediaType,
): StoredCastMember[] {
  const isTv = mediaType === MediaType.TV;
  return [...(cast ?? [])]
    .sort((a, b) =>
      isTv
        ? (b.total_episode_count ?? 0) - (a.total_episode_count ?? 0) || (a.order ?? 0) - (b.order ?? 0)
        : (a.order ?? 0) - (b.order ?? 0),
    )
    .slice(0, FULL_CAST_MAX)
    .map((m) => ({
      id: m.id,
      name: m.name,
      character: (isTv ? showCharacter(m) : m.character) || null,
      profile: m.profile_path ?? null,
      ...(isTv ? { episodes: m.total_episode_count ?? 0 } : {}),
    }));
}

/**
 * The info page row: a movie's leads (top billed); a show's regulars — in at least
 * TV_REGULAR_SHARE of its episodes — or its top billed when none stands out
 */
export function featuredCast(
  full: StoredCastMember[],
  mediaType: MediaType,
  totalEpisodes: number | undefined,
): StoredCastMember[] {
  if (mediaType === MediaType.MOVIE) return full.slice(0, MOVIE_LEADS);
  const threshold = Math.max(TV_REGULAR_MIN_EPISODES, (totalEpisodes ?? 0) * TV_REGULAR_SHARE);
  const regulars = full.filter((m) => (m.episodes ?? 0) >= threshold);
  return (regulars.length > 0 ? regulars : full.slice(0, FEATURED_CAST_FALLBACK)).slice(
    0,
    FEATURED_CAST_MAX,
  );
}

/** For matching: lowercase, accents dropped ("Zoë" → "zoe") */
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Cast members whose name or character contains the query (case / accent-insensitive) */
export function searchCast(cast: StoredCastMember[], query: string): StoredCastMember[] {
  const q = fold(query.trim());
  if (!q) return cast;
  return cast.filter((m) => fold(m.name).includes(q) || (m.character && fold(m.character).includes(q)));
}

/** A movie's directors, each once, in TMDB's order */
export function normalizeDirectors(crew: TmdbCrewMember[] | undefined): StoredCrewMember[] {
  const seen = new Set<number>();
  return (crew ?? [])
    .filter((c) => c.job === "Director" && !seen.has(c.id) && seen.add(c.id))
    .map((c) => ({ id: c.id, name: c.name, profile: c.profile_path ?? null }));
}

/** A movie's writers (screenplay, story, novel…), each once, in TMDB's order */
export function normalizeWriters(crew: TmdbCrewMember[] | undefined): StoredCrewMember[] {
  const seen = new Set<number>();
  return (crew ?? [])
    .filter((c) => c.department === "Writing" && !seen.has(c.id) && seen.add(c.id))
    .slice(0, WRITERS_MAX)
    .map((c) => ({ id: c.id, name: c.name, profile: c.profile_path ?? null }));
}

/** Studios with a logo (the row shows logos only): a show's networks first, then companies */
export function normalizeStudios(
  networks: TmdbCompany[] | undefined,
  companies: TmdbCompany[] | undefined,
): StoredStudio[] {
  const seen = new Set<number>();
  return [...(networks ?? []), ...(companies ?? [])]
    .filter((c) => c.logo_path && !seen.has(c.id) && seen.add(c.id))
    .map((c) => ({ id: c.id, name: c.name, logo: c.logo_path as string }));
}
