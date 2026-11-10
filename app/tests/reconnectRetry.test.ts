import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
	createReconnectNotifier,
	isFailedLoad,
	retryFailedQueries,
} from "../src/utils/reconnectRetry";

test("fires only on an offline → online change", () => {
	const n = createReconnectNotifier();
	let fired = 0;
	n.subscribe(() => fired++);
	n.report(true); // first known state: online — nothing to retry
	n.report(true);
	assert.equal(fired, 0);
	n.report(false);
	n.report(null); // unknown changes nothing
	n.report(undefined);
	assert.equal(fired, 0);
	n.report(true);
	assert.equal(fired, 1);
	n.report(true); // still online — no second retry
	assert.equal(fired, 1);
});

test("a cold start offline fires once the connection comes", () => {
	const n = createReconnectNotifier();
	let fired = 0;
	n.subscribe(() => fired++);
	n.report(false);
	n.report(true);
	assert.equal(fired, 1);
});

test("unsubscribed listeners are not called", () => {
	const n = createReconnectNotifier();
	let fired = 0;
	const off = n.subscribe(() => fired++);
	off();
	n.report(false);
	n.report(true);
	assert.equal(fired, 0);
});

const base = { data: undefined, fetchStatus: "idle", fetchFailureCount: 0 } as const;

test("isFailedLoad: errored with no data", () => {
	assert.equal(isFailedLoad({ ...base, status: "error", fetchFailureCount: 3 }), true);
});

test("isFailedLoad: never a query that has data, even if its refetch failed", () => {
	assert.equal(
		isFailedLoad({ ...base, data: { results: [] }, status: "error", fetchFailureCount: 3 }),
		false,
	);
	assert.equal(isFailedLoad({ ...base, data: 1, status: "success" }), false);
});

test("isFailedLoad: not one that is fetching or paused", () => {
	assert.equal(isFailedLoad({ ...base, status: "error", fetchStatus: "fetching" }), false);
	assert.equal(isFailedLoad({ ...base, status: "pending", fetchStatus: "paused" }), false);
});

test("isFailedLoad: a pending query that never failed is not a failed load", () => {
	assert.equal(isFailedLoad({ ...base, status: "pending" }), false);
	assert.equal(isFailedLoad({ ...base, status: "pending", fetchFailureCount: 1 }), true);
});

test("retryFailedQueries refetches only the on-screen queries that failed with no data", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const calls: string[] = [];
	let online = false;
	const fn = (name: string) => async () => {
		calls.push(name);
		if (!online) throw new Error("offline");
		return name;
	};
	// Failed, on screen
	const failed = new QueryObserver(client, { queryKey: ["failed"], queryFn: fn("failed") });
	const offFailed = failed.subscribe(() => {});
	// Has data (cached), on screen — its refetch failed too
	client.setQueryData(["cached"], "kept");
	const cached = new QueryObserver(client, {
		queryKey: ["cached"],
		queryFn: fn("cached"),
		staleTime: Infinity,
	});
	const offCached = cached.subscribe(() => {});
	// Failed but not on screen
	await client.prefetchQuery({ queryKey: ["hidden"], queryFn: fn("hidden") });
	await new Promise((r) => setTimeout(r, 10));
	assert.equal(client.getQueryState(["failed"])?.status, "error");
	assert.equal(client.getQueryState(["hidden"])?.status, "error");

	calls.length = 0;
	online = true;
	await retryFailedQueries(client);
	assert.deepEqual(calls, ["failed"]);
	assert.equal(client.getQueryData(["failed"]), "failed");
	assert.equal(client.getQueryData(["cached"]), "kept");
	offFailed();
	offCached();
	client.clear();
});
