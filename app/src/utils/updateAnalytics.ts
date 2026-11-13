import { UpdateSource } from "../enums";

/**
 * Whether this launch is the first on a newer build, and how that build got here. `lastBuild`:
 * the build the previous launch ran (0 on a first install, which isn't an update). `drawerBuild`:
 * the build the drawer last started downloading; the same build as this one means the drawer got
 * it, anything else came through the notification (or a manual install)
 */
export function detectAppUpdate(
	lastBuild: number,
	currentBuild: number,
	drawerBuild: number,
): { fromBuild: number; source: UpdateSource } | null {
	if (lastBuild <= 0 || currentBuild <= lastBuild) return null;
	return {
		fromBuild: lastBuild,
		source: drawerBuild === currentBuild ? UpdateSource.DRAWER : UpdateSource.NOTIFICATION_OR_OTHER,
	};
}
