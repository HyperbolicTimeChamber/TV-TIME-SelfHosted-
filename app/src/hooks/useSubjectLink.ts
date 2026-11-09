import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSubjectLink } from "../services/titleExtras";
import { linkFrom, personLink, studioLink, type SubjectLink } from "../utils/subjectLink";
import { PhotoSubjectKind, QueryKey } from "../enums";
import type { PhotoSubject } from "../types";

/** Before the CF has answered, or when it couldn't */
const fallbackLink = (subject: PhotoSubject): SubjectLink =>
	subject.kind === PhotoSubjectKind.PERSON ? personLink(subject.name) : studioLink(subject.id);

const linkQuery = (subject: PhotoSubject) => ({
	queryKey: [QueryKey.SUBJECT_LINK, subject.kind, subject.id],
	queryFn: async () => linkFrom(subject, await fetchSubjectLink(subject)) ?? fallbackLink(subject),
	staleTime: Infinity,
});

/**
 * For lists, where asking up front would mean a call per row: a subject's link when it's tapped
 * (same cache as the viewer's), the fallback if the CF can't answer
 */
export function useResolveSubjectLink() {
	const queryClient = useQueryClient();
	return useCallback(
		async (subject: PhotoSubject): Promise<string> => {
			const stored = linkFrom(subject, subject);
			if (stored) return stored.url;
			const link = await queryClient
				.fetchQuery(linkQuery(subject))
				.catch(() => fallbackLink(subject));
			return link.url;
		},
		[queryClient],
	);
}

/**
 * Where the photo viewer's pill goes: a person's IMDb page, a studio's website. Stored with them
 * on the title once anyone has opened them; until then one subjectLink CF call. `resolving` until
 * it answers, so a tap can't land on the fallback while the real link is on its way
 */
export function useSubjectLink(subject: PhotoSubject) {
	const stored = linkFrom(subject, subject);
	const { data, isLoading } = useQuery({ ...linkQuery(subject), enabled: !stored, retry: 1 });
	return { ...(stored ?? data ?? fallbackLink(subject)), resolving: isLoading };
}
