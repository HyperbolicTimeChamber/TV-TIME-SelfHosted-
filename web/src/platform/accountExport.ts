import { CloudFunction, type MediaType } from "@app/enums";
import {
	accountExportFileName,
	type AccountExportOptions,
	type RestoreMatch,
} from "@app/utils/accountExport";
import type { UserFacetsDoc } from "@app/utils/historyView";
import { foregroundCall } from "@app/services/callQueue";
import { setUserFacets } from "@app/services/userFacets";
import { getFunctions, httpsCallable } from "./functions";
import type { PickResult } from "./customListsFiles";

/** An import of a big account runs for minutes server-side */
const IMPORT_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * The exportAccountData function gathers the chosen titles and parts server-side. `jobId` lets
 * cancelAccountJob stop it between its reads.
 */
export async function fetchAccountExport(
	options: AccountExportOptions,
	jobId: string,
): Promise<unknown> {
	const result = await foregroundCall(() =>
		httpsCallable(getFunctions(), CloudFunction.EXPORT_ACCOUNT_DATA)({ ...options, jobId }),
	);
	return result.data;
}

/** Cancelling a finished import takes it back (minutes on a big one) */
const CANCEL_TIMEOUT_MS = 9 * 60 * 1000;

/**
 * Export / Import → Cancel: an export stops at its next read; an import stops and takes back
 * what it added (also once it had finished). Resolves when the server has done that (app parity)
 */
export async function cancelAccountJob(jobId: string): Promise<void> {
	await foregroundCall(() =>
		httpsCallable(getFunctions(), CloudFunction.CANCEL_ACCOUNT_JOB, {
			timeout: CANCEL_TIMEOUT_MS,
		})({ jobId }),
	).catch(() => {});
}

/** Settings → Export My Data: the fetched JSON, downloaded as a file */
export function downloadAccountExport(data: unknown, options?: AccountExportOptions): void {
	const json = JSON.stringify(data, null, 2);
	const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = accountExportFileName(Date.now(), options);
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

/** Reads the text of a file the user chose, refusing one over `maxBytes` */
export async function readJsonFile(
	file: File | undefined | null,
	maxBytes: number,
): Promise<PickResult> {
	if (!file) return { ok: false, reason: "canceled" };
	if (file.size > maxBytes) return { ok: false, reason: "too_large" };
	try {
		return { ok: true, text: await file.text() };
	} catch {
		return { ok: false, reason: "unreadable" };
	}
}

export interface AccountImportResult {
	titlesAdded: number;
	titlesSkipped: number;
	episodesImported: number;
	moviesImported: number;
}

/**
 * Settings → Import: the file's titles go through importMatches with keepExisting — a title
 * already tracked is left exactly as it is (progress and history), history is only ever
 * created where missing, so nothing is overwritten or doubled
 */
export async function importAccountTitles(
	uid: string,
	matches: RestoreMatch[],
	jobId: string,
): Promise<AccountImportResult> {
	const res = await httpsCallable(getFunctions(), CloudFunction.IMPORT_MATCHES, {
		timeout: IMPORT_TIMEOUT_MS,
	})({ matches, keepExisting: true, jobId });
	const data = (res.data ?? {}) as {
		titlesSkipped?: number;
		episodesImported?: number;
		moviesImported?: number;
		facets?: Partial<Record<MediaType, UserFacetsDoc>>;
	};
	// The import rebuilt the filter choices — keep them (no read)
	if (data.facets) setUserFacets(uid, data.facets);
	const titlesSkipped = data.titlesSkipped ?? 0;
	return {
		titlesAdded: matches.length - titlesSkipped,
		titlesSkipped,
		episodesImported: data.episodesImported ?? 0,
		moviesImported: data.moviesImported ?? 0,
	};
}
