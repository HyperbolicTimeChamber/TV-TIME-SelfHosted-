import { Share } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { CloudFunction, MediaType } from "../enums";
import {
	accountExportFileName,
	type AccountExportOptions,
	type RestoreMatch,
} from "../utils/accountExport";
import type { UserFacetsDoc } from "../utils/historyView";
import { foregroundCall } from "./callQueue";
import { setUserFacets } from "./userFacets";

/** An import of a big account runs for minutes server-side */
const IMPORT_TIMEOUT_MS = 60 * 60 * 1000;
/** Cancelling a finished import takes it back (minutes on a big one) */
const CANCEL_TIMEOUT_MS = 9 * 60 * 1000;

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

/**
 * Export / Import → Cancel: an export stops at its next read; an import stops and takes back
 * what it added (also once it had finished). Resolves when the server has done that
 */
export async function cancelAccountJob(jobId: string): Promise<void> {
	await foregroundCall(() =>
		httpsCallable(getFunctions(), CloudFunction.CANCEL_ACCOUNT_JOB, {
			timeout: CANCEL_TIMEOUT_MS,
		})({ jobId }),
	).catch(() => {});
}

/** Settings → Export: the fetched JSON goes out through the share sheet like a list export */
export async function shareAccountExport(
	data: unknown,
	options?: AccountExportOptions,
): Promise<void> {
	const now = Date.now();
	const json = JSON.stringify(data, null, 2);
	const file = new File(Paths.cache, accountExportFileName(now, options));
	file.create({ overwrite: true });
	file.write(json);
	if (await Sharing.isAvailableAsync()) {
		await Sharing.shareAsync(file.uri, {
			mimeType: "application/json",
			dialogTitle: "Export my data",
		});
	} else {
		await Share.share({ message: json });
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
