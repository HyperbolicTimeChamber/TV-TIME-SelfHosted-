import { CloudFunction } from "@app/enums";
import { accountExportFileName } from "@app/utils/accountExport";
import { foregroundCall } from "@app/services/callQueue";
import { getFunctions, httpsCallable } from "./functions";

/** Settings → Export My Data: the exportAccountData function's JSON, downloaded as a file */
export async function downloadAccountExport(): Promise<void> {
	const result = await foregroundCall(() =>
		httpsCallable(getFunctions(), CloudFunction.EXPORT_ACCOUNT_DATA)({}),
	);
	const json = JSON.stringify(result.data, null, 2);
	const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = accountExportFileName(Date.now());
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
