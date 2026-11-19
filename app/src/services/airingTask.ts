import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { AIRING_TASK, AIRING_TASK_MINUTES, ReplanSource } from "../enums";
import { replanAiring } from "./airingScheduler";

// Global scope on purpose: the task must be defined whenever the JS bundle loads, including headless
TaskManager.defineTask(AIRING_TASK, async () => {
	try {
		await replanAiring(ReplanSource.BACKGROUND);
		return BackgroundTask.BackgroundTaskResult.Success;
	} catch {
		return BackgroundTask.BackgroundTaskResult.Failed;
	}
});

/** Registered while some alert is on (survives restarts); unregistered when all are off */
export async function setAiringTaskEnabled(enabled: boolean): Promise<void> {
	const registered = await TaskManager.isTaskRegisteredAsync(AIRING_TASK);
	if (enabled && !registered) {
		await BackgroundTask.registerTaskAsync(AIRING_TASK, { minimumInterval: AIRING_TASK_MINUTES });
	} else if (!enabled && registered) {
		await BackgroundTask.unregisterTaskAsync(AIRING_TASK);
	}
}
