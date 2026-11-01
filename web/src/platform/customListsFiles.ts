import type { CustomList } from "@app/types";
import { buildListsExport, listsExportFileName } from "@app/utils/customListsIO";

/** Same cap as the app: only stops a wrong file being read in full */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Exports lists as a .json download (the file is what gets shared and imported) */
export function downloadListsExport(lists: CustomList[]): void {
	const now = Date.now();
	const json = JSON.stringify(buildListsExport(lists, now), null, 2);
	const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = listsExportFileName(lists, now);
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

export type PickResult =
	| { ok: true; text: string }
	| { ok: false; reason: "canceled" | "too_large" | "unreadable" };

/** Reads the text of a file the user chose (an <input type=file> change event's file) */
export async function readListsFile(file: File | undefined | null): Promise<PickResult> {
	if (!file) return { ok: false, reason: "canceled" };
	if (file.size > MAX_IMPORT_BYTES) return { ok: false, reason: "too_large" };
	try {
		return { ok: true, text: await file.text() };
	} catch {
		return { ok: false, reason: "unreadable" };
	}
}
