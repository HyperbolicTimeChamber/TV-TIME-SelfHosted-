import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// lib/hooks → functions/
const FUNCTIONS_DIR = join(__dirname, "..", "..");

/**
 * Scripts: the Firebase project to act on — GCLOUD_PROJECT, else the repo's .firebaserc default
 * (what `firebase use` picked), so a fork acts on its own project, never this one
 */
export function scriptProjectId(): string {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  const rc = join(FUNCTIONS_DIR, "..", ".firebaserc");
  const id: string | undefined = existsSync(rc)
    ? JSON.parse(readFileSync(rc, "utf8")).projects?.default
    : undefined;
  if (!id) throw new Error("No Firebase project: set GCLOUD_PROJECT or run `firebase use`");
  process.env.GCLOUD_PROJECT = id;
  return id;
}

/**
 * Scripts: load functions/.env.<projectId> (gitignored, project-specific values such as the
 * Mixpanel token) the same way `firebase deploy` loads it for deployed functions
 */
export function loadProjectEnv() {
  const file = join(FUNCTIONS_DIR, `.env.${scriptProjectId()}`);
  if (existsSync(file)) process.loadEnvFile(file);
}
