/** Minimal in-memory Firestore stand-in: records writes and counts queries */
export interface FakeDb {
  writes: Array<{ path: string; data: Record<string, unknown> }>;
  queries: number;
}

export function fakeDb(watched: Array<Record<string, unknown>> = []) {
  const state: FakeDb = { writes: [], queries: 0 };
  const db = {
    state,
    doc: (path: string) => ({
      path,
      set: async (data: Record<string, unknown>) => {
        state.writes.push({ path, data });
      },
    }),
    collection: (path: string) => ({
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => {
          state.queries++;
          return {
            docs: watched
              .filter((w) => w[field] === value)
              .map((w) => ({ data: () => w })),
          };
        },
      }),
      doc: (id: string) => ({ path: `${path}/${id}` }),
    }),
    batch: () => {
      const ops: FakeDb["writes"] = [];
      return {
        set: (ref: { path: string }, data: Record<string, unknown>) =>
          ops.push({ path: ref.path, data }),
        delete: () => undefined,
        commit: async () => {
          state.writes.push(...ops);
        },
      };
    },
  };
  return db as unknown as FirebaseFirestore.Firestore & { state: FakeDb };
}

export function trackingDoc(id: string, data: Record<string, unknown>) {
  return {
    id,
    ref: { path: `users/u/tracking/${id}` },
    data: () => data,
  } as unknown as FirebaseFirestore.QueryDocumentSnapshot;
}
