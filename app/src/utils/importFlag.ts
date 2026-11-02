import { CacheKey } from "../enums";

/** AsyncStorage key of the per-account "import screen done" flag (Skip / Done on the import screen) */
export const importDoneKey = (uid: string): string => `${CacheKey.IMPORT_DONE}${uid}`;

/**
 * Next value of hasCompletedImport once a source reports in. Sources only ever turn it on: a cached
 * doc, a late server read or a doc whose flag write was refused must not bring the import screen
 * back after Skip.
 */
export function mergeImportFlag(current: boolean, reported: boolean | undefined): boolean {
	return current || reported === true;
}
