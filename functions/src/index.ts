import { initializeApp } from "firebase-admin/app";

initializeApp(); // Node 22 runtime

export { addShow } from "./cloudFunctions/addShow";
export { removeShow } from "./cloudFunctions/removeShow";
export { importMatches } from "./cloudFunctions/importMatches";
export { syncCatalog } from "./cloudFunctions/syncCatalog";
export { markSeasonWatched } from "./cloudFunctions/markSeasonWatched";
export { testFCM } from "./cloudFunctions/testFCM";
export { deleteAccount } from "./cloudFunctions/deleteAccount";
export { rebuildUpcoming } from "./cloudFunctions/rebuildUpcoming";
export { migrateDocIds } from "./cloudFunctions/migrateDocIds";
export { tmdbProxy } from "./cloudFunctions/tmdbProxy";
