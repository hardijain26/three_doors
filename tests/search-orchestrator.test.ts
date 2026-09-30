import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchDueSearches } from "../lib/search/orchestrator.ts";

function query(data: unknown, error: Error | null = null) {
  const result = { data, error };
  const q: any = {
    select: () => q,
    eq: () => q,
    neq: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: async () => result,
    then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

test("scheduled search dispatch leaves run claiming to the endpoint", async () => {
  const insertCalls: unknown[][] = [];
  const admin: any = {
    from(table: string) {
      if (table === "profiles") return query([{ id: "user-1", search: { schedule: { freq: "daily", time: "00:00" } } }]);
      if (table === "search_runs") {
        const q = query(null);
        q.insert = (...args: unknown[]) => insertCalls.push(args);
        return q;
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    const result = await dispatchDueSearches({
      admin,
      requestUrl: "https://three-doors.example/api/cron/search",
      cronSecret: "cron-secret",
    });

    assert.deepEqual(result, { checked: 1, triggered: 1, results: [{ user: "user-1", status: 200 }] });
    assert.equal(insertCalls.length, 0);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers.get("x-three-doors-user-id"), "user-1");
    assert.equal(requests[0].headers.get("x-three-doors-cron-secret"), "cron-secret");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scheduled search dispatch surfaces run-history lookup failures", async () => {
  let dispatched = false;
  const admin: any = {
    from(table: string) {
      if (table === "profiles") return query([{ id: "user-1", search: { schedule: { freq: "daily", time: "00:00" } } }]);
      if (table === "search_runs") return query(null, new Error("history lookup failed"));
      throw new Error(`unexpected table: ${table}`);
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    dispatched = true;
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    await assert.rejects(dispatchDueSearches({
      admin,
      requestUrl: "https://three-doors.example/api/cron/search",
      cronSecret: "cron-secret",
    }), /history lookup failed/);
    assert.equal(dispatched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
