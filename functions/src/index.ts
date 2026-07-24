import { initializeApp } from "firebase-admin/app";

initializeApp(); // Node 22 runtime

export { addShow } from "./addShow";
export { removeShow } from "./removeShow";
export { importMatches } from "./importMatches";
export { syncCatalog } from "./syncCatalog";
export { markSeasonWatched } from "./markSeasonWatched";
export { testFCM } from "./testFCM";
export { deleteAccount } from "./deleteAccount";
export { rebuildUpcoming } from "./rebuildUpcoming";
export { migrateDocIds } from "./migrateDocIds";
