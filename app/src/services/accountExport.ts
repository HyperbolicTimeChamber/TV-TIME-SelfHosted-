import { Share } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { CloudFunction } from "../enums";
import { accountExportFileName } from "../utils";

/**
 * Settings → Export My Data: the exportAccountData function gathers everything server-side
 * (tracking, watch history, lists); the JSON goes out through the share sheet like a list export.
 */
export async function shareAccountExport(): Promise<void> {
	const result = await httpsCallable(getFunctions(), CloudFunction.EXPORT_ACCOUNT_DATA)({});
	const now = Date.now();
	const json = JSON.stringify(result.data, null, 2);
	const file = new File(Paths.cache, accountExportFileName(now));
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
