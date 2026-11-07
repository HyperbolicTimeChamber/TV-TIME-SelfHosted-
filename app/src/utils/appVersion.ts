import appConfig from "../../app.json";

/** This build's version name (app.json `expo.version`, the one people see) — web ships the app's */
export const APP_VERSION: string = appConfig.expo.version;

/** This build's versionCode — CI builds from app.json and publishes the same number, so the
 *  update check and the server's force-update gate compare like with like (0 = unknown) */
export const APP_BUILD: number = Number(appConfig.expo.android?.versionCode ?? 0) || 0;

/** "V 1.2.0": the dim label at the bottom of Login and Settings */
export const APP_VERSION_LABEL = `V ${APP_VERSION}`;
