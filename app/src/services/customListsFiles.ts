import { Share } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { CustomList } from "../types";
import { buildListsExport, listsExportFileName } from "../utils";

/** An exported file is a few KB per hundred titles; this only stops a wrong file being read in full */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/**
 * Exports lists as a .json file and opens the share sheet (messaging, social apps, Files…). Where
 * file sharing isn't available it shares the JSON as text instead.
 */
export async function shareListsExport(lists: CustomList[]): Promise<void> {
	const now = Date.now();
	const json = JSON.stringify(buildListsExport(lists, now), null, 2);
	const file = new File(Paths.cache, listsExportFileName(lists, now));
	file.create({ overwrite: true });
	file.write(json);
	if (await Sharing.isAvailableAsync()) {
		await Sharing.shareAsync(file.uri, {
			mimeType: "application/json",
			dialogTitle: lists.length === 1 ? `Share "${lists[0].name}"` : "Share your lists",
		});
	} else {
		await Share.share({ message: json });
	}
}

export type PickResult =
	| { ok: true; text: string }
	| { ok: false; reason: "canceled" | "too_large" | "unreadable" };

/** "Import List": the user picks a .json file; its text comes back for parseListsExport */
export async function pickListsFile(): Promise<PickResult> {
	const result = await DocumentPicker.getDocumentAsync({
		// Shared files arrive under many types (json, text, octet-stream) depending on the app they came through
		type: ["application/json", "text/plain", "application/octet-stream", "*/*"],
		copyToCacheDirectory: true,
		multiple: false,
	});
	if (result.canceled || !result.assets?.[0]) return { ok: false, reason: "canceled" };
	const asset = result.assets[0];
	if (asset.size && asset.size > MAX_IMPORT_BYTES) return { ok: false, reason: "too_large" };
	try {
		return { ok: true, text: await new File(asset.uri).text() };
	} catch {
		return { ok: false, reason: "unreadable" };
	}
}
