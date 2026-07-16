import { initializeApp } from "firebase-admin/app";

initializeApp();

export { addShow } from "./addShow";
export { removeShow } from "./removeShow";
export { importMatches } from "./importMatches";
export { syncCatalog } from "./syncCatalog";
export { markSeasonWatched } from "./markSeasonWatched";
