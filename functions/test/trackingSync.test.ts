import { test } from "node:test";
import assert from "node:assert/strict";
import { FieldValue } from "firebase-admin/firestore";
import { deleteTracking, isTrackingRef, stampTracking } from "../src/shared/trackingSync";
import { TRACKING_UPDATED_AT, UserCollection } from "../src/shared/enums";

const ref = (path: string): FirebaseFirestore.DocumentReference => {
  const parts = path.split("/");
  return {
    path,
    id: parts[parts.length - 1],
    parent: {
      parent: {
        collection: (name: string) => ({
          doc: (id: string) => ({ path: `${parts.slice(0, -2).join("/")}/${name}/${id}` }),
        }),
      },
    },
  } as unknown as FirebaseFirestore.DocumentReference;
};

test("isTrackingRef matches users/{uid}/tracking/{id} only", () => {
  assert.equal(isTrackingRef(ref("users/u/tracking/tv_1")), true);
  assert.equal(isTrackingRef(ref("users/u/watchedEpisodes/1_S01E01")), false);
  assert.equal(isTrackingRef(ref("users/u/trackingDeletions/tv_1")), false);
});

test("stampTracking adds a server-time updatedAt", () => {
  assert.deepEqual(stampTracking({ status: "watching" }), {
    status: "watching",
    [TRACKING_UPDATED_AT]: FieldValue.serverTimestamp(),
  });
});

test("deleteTracking deletes the doc and logs a deletion entry with the same id", () => {
  const ops: Array<[string, string, unknown?]> = [];
  const batch = {
    delete: (r: { path: string }) => ops.push(["delete", r.path]),
    set: (r: { path: string }, data: unknown) => ops.push(["set", r.path, data]),
  } as unknown as FirebaseFirestore.WriteBatch;
  deleteTracking(batch, ref("users/u/tracking/tv_7"));
  assert.deepEqual(ops[0], ["delete", "users/u/tracking/tv_7"]);
  assert.equal(ops[1][0], "set");
  assert.equal(ops[1][1], `users/u/${UserCollection.TRACKING_DELETIONS}/tv_7`);
  const entry = ops[1][2] as Record<string, unknown>;
  assert.deepEqual(entry[TRACKING_UPDATED_AT], FieldValue.serverTimestamp());
  assert.ok((entry.expireAt as FirebaseFirestore.Timestamp).toMillis() > Date.now());
});
