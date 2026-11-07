import { initializeApp } from "firebase-admin/app";

initializeApp();

export { addShow } from "./cloudFunctions/addShow";
export { removeShow } from "./cloudFunctions/removeShow";
export { importMatches } from "./cloudFunctions/importMatches";
export { syncCatalog } from "./cloudFunctions/syncCatalog";
export { markSeasonWatched } from "./cloudFunctions/markSeasonWatched";
export { testFCM } from "./cloudFunctions/testFCM";
export { sendTestPush } from "./cloudFunctions/sendTestPush";
export { deleteAccount } from "./cloudFunctions/deleteAccount";
export { purgeUserData } from "./cloudFunctions/purgeUserData";
export { rebuildUpcoming } from "./cloudFunctions/rebuildUpcoming";
export { tmdbProxy } from "./cloudFunctions/tmdbProxy";
export { sharePreview } from "./cloudFunctions/sharePreview";
export { refreshShow } from "./cloudFunctions/refreshShow";
export { budgetGuard } from "./cloudFunctions/budgetGuard";
export { searchTitles } from "./cloudFunctions/searchTitles";
export { exportAccountData } from "./cloudFunctions/exportAccountData";
export { cancelAccountJob } from "./cloudFunctions/cancelAccountJob";
export { rollbackCancelledImport } from "./cloudFunctions/rollbackCancelledImport";
export { trackingSyncStamp } from "./cloudFunctions/trackingSyncStamp";
export { watchProviders } from "./cloudFunctions/watchProviders";
export { titleExtras } from "./cloudFunctions/titleExtras";
export { titleCastPage } from "./cloudFunctions/titleCastPage";
