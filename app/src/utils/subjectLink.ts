import { MediaType, PhotoSubjectKind, TmdbStudioType } from "../enums";
import type { CastMember, CrewMember, PhotoSubject, Studio, SubjectLinkResult } from "../types";

export interface SubjectLink {
	url: string;
	label: string;
}

const IMDB_LABEL = "View on IMDb";
const WEBSITE_LABEL = "Visit Website";
const TMDB_LABEL = "View on TMDB";

/** A person's IMDb page when TMDB knows their IMDb id, else IMDb's search for the name */
export function personLink(name: string, imdbId?: string | null): SubjectLink {
	const url = imdbId
		? `https://www.imdb.com/name/${imdbId}/`
		: `https://www.imdb.com/find/?q=${encodeURIComponent(name)}&s=nm`;
	return { url, label: IMDB_LABEL };
}

/** A studio's own website, else its TMDB page */
export function studioLink(
	id: number,
	studio?: { type: TmdbStudioType; homepage: string | null } | null,
): SubjectLink {
	if (studio?.homepage && /^https?:\/\//i.test(studio.homepage)) {
		return { url: studio.homepage, label: WEBSITE_LABEL };
	}
	const type = studio?.type ?? TmdbStudioType.COMPANY;
	return { url: `https://www.themoviedb.org/${type}/${id}`, label: TMDB_LABEL };
}

type Title = { tmdbId: number; mediaType: MediaType };

/** What the viewer / a link needs to know about a cast or crew member */
export const personSubject = (m: CastMember | CrewMember, title: Title): PhotoSubject => ({
	kind: PhotoSubjectKind.PERSON,
	id: m.id,
	name: m.name,
	path: m.profile ?? "",
	...title,
	imdbId: m.imdbId,
});

export const studioSubject = (s: Studio, title: Title): PhotoSubject => ({
	kind: PhotoSubjectKind.STUDIO,
	id: s.id,
	name: s.name,
	path: s.logo,
	...title,
	studioType: s.studioType,
	homepage: s.homepage,
});

/** The link once it's known: the subjectLink CF's answer, or what's stored on the subject */
export function linkFrom(subject: PhotoSubject, known: SubjectLinkResult): SubjectLink | null {
	if (subject.kind === PhotoSubjectKind.PERSON) {
		return known.imdbId === undefined ? null : personLink(subject.name, known.imdbId);
	}
	return known.studioType
		? studioLink(subject.id, { type: known.studioType, homepage: known.homepage ?? null })
		: null;
}
