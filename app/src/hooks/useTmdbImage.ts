import { PixelRatio } from "react-native";
import { TMDB_IMAGE_BASE } from "../theme";

type PosterSize = "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original";
type BackdropSize = "w300" | "w780" | "w1280" | "original";
type StillSize = "w92" | "w185" | "w300" | "original";

const PX_RATIO = PixelRatio.get();

function toPhysicalPx(layoutWidth: number): number {
	return layoutWidth * PX_RATIO;
}

export function getTmdbPosterSize(layoutWidth: number): PosterSize {
	const px = toPhysicalPx(layoutWidth);
	if (px <= 92) return "w92";
	if (px <= 154) return "w154";
	if (px <= 185) return "w185";
	if (px <= 342) return "w342";
	if (px <= 500) return "w500";
	if (px <= 780) return "w780";
	return "original";
}

export function getTmdbBackdropSize(layoutWidth: number): BackdropSize {
	const px = toPhysicalPx(layoutWidth);
	if (px <= 300) return "w300";
	if (px <= 780) return "w780";
	if (px <= 1280) return "w1280";
	return "original";
}

export function getTmdbStillSize(layoutWidth: number): StillSize {
	const px = toPhysicalPx(layoutWidth);
	if (px <= 92) return "w92";
	if (px <= 185) return "w185";
	if (px <= 500) return "w300";
	return "original";
}

export function tmdbPosterUri(path: string, layoutWidth: number): string {
	return `${TMDB_IMAGE_BASE}/${getTmdbPosterSize(layoutWidth)}${path}`;
}

export function tmdbBackdropUri(path: string, layoutWidth: number): string {
	return `${TMDB_IMAGE_BASE}/${getTmdbBackdropSize(layoutWidth)}${path}`;
}

export function tmdbStillUri(path: string, layoutWidth: number): string {
	return `${TMDB_IMAGE_BASE}/${getTmdbStillSize(layoutWidth)}${path}`;
}
