import { initializeApp } from "firebase-admin/app";

initializeApp();

export { addShow } from "./cloudFunctions/addShow";
export { removeShow } from "./cloudFunctions/removeShow";
export { importMatches } from "./cloudFunctions/importMatches";
export { syncCatalog } from "./cloudFunctions/syncCatalog";
export { markSeasonWatched } from "./cloudFunctions/markSeasonWatched";
export { testFCM } from "./cloudFunctions/testFCM";
export { deleteAccount } from "./cloudFunctions/deleteAccount";
export { purgeUserData } from "./cloudFunctions/purgeUserData";
export { rebuildUpcoming } from "./cloudFunctions/rebuildUpcoming";
export { tmdbProxy } from "./cloudFunctions/tmdbProxy";
export { sharePreview } from "./cloudFunctions/sharePreview";
export { refreshShow } from "./cloudFunctions/refreshShow";
export { budgetGuard } from "./cloudFunctions/budgetGuard";
export { searchTitles } from "./cloudFunctions/searchTitles";
