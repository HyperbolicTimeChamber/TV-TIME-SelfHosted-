import {
  AIRING_PUSH_MAX_ITEMS,
  AIRING_WINDOW_DAYS,
  MediaType,
  NotificationType,
} from "./enums";
import type { AiringPushData, AiringPushItem, CatalogShow } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD (UTC) of a moment */
export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

type AirSource = Pick<CatalogShow, "mediaType" | "seasons" | "releaseDate">;

/** Dates (UTC) inside [today, today + AIRING_WINDOW_DAYS] an episode airs / the movie releases, sorted */
export function airDates14(show: AirSource, now = Date.now()): string[] {
  const from = utcDate(now);
  const to = utcDate(now + AIRING_WINDOW_DAYS * DAY_MS);
  const dates = new Set<string>();
  const add = (date: string | null | undefined) => {
    if (date && date >= from && date <= to) dates.add(date);
  };
  if (show.mediaType === MediaType.MOVIE) {
    add(show.releaseDate);
  } else {
    for (const season of show.seasons ?? []) {
      for (const ep of season.episodes ?? []) {
        add(ep.airDate);
        const stamp = ep.airStamp ? Date.parse(ep.airStamp) : NaN;
        if (!Number.isNaN(stamp)) add(utcDate(stamp));
      }
    }
  }
  return [...dates].sort();
}

/** Episodes of `show` airing on any of `dates` (UTC; by TMDB date or by exact stamp), oldest first */
export function airingItems(show: AirSource, dates: string[]): AiringPushItem[] {
  const wanted = new Set(dates);
  const items: AiringPushItem[] = [];
  for (const season of show.seasons ?? []) {
    for (const ep of season.episodes ?? []) {
      const stamp = ep.airStamp ? Date.parse(ep.airStamp) : NaN;
      const byStamp = !Number.isNaN(stamp) && wanted.has(utcDate(stamp));
      const byDate = !!ep.airDate && wanted.has(ep.airDate);
      if (!byStamp && !byDate) continue;
      items.push({
        season: season.seasonNumber,
        episode: ep.episodeNumber,
        name: ep.title ?? "",
        airDate: ep.airDate,
        ...(ep.airStamp ? { airStamp: ep.airStamp } : {}),
      });
    }
  }
  return items.sort((a, b) => a.season - b.season || a.episode - b.episode);
}

/** The FCM data for one title, or null when nothing of it airs / releases on `dates` */
export function airingPushData(
  docId: string,
  show: AirSource & { title: string },
  dates: string[],
): AiringPushData | null {
  if (show.mediaType === MediaType.MOVIE) {
    if (!show.releaseDate || !dates.includes(show.releaseDate)) return null;
    return {
      type: NotificationType.AIRING,
      docId,
      mediaType: show.mediaType,
      title: show.title,
      items: "[]",
      count: "0",
      releaseDate: show.releaseDate,
    };
  }
  const items = airingItems(show, dates);
  if (items.length === 0) return null;
  return {
    type: NotificationType.AIRING,
    docId,
    mediaType: show.mediaType,
    title: show.title,
    items: JSON.stringify(items.slice(0, AIRING_PUSH_MAX_ITEMS)),
    count: String(items.length),
  };
}
