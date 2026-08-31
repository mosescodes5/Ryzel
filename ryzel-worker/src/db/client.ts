import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema";
import type { Env } from "../types";

/**
 * Uses `Client` with an explicit `await client.connect()`, matching
 * Cloudflare's own documented working pattern exactly
 * (developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres) —
 * NOT `Pool`, which is what this originally used. That was the actual bug:
 * `pg`'s `Pool` connects lazily on first query rather than eagerly, and
 * that lazy-connect path combined with the Workers TCP-socket shim is a
 * known source of requests that hang indefinitely with no error at all
 * (see github.com/cloudflare/workers-sdk/issues/6179 — "obscure hangs
 * while using hyperdrive and postgres"). A fresh Client per request is
 * correct here despite looking wasteful: Hyperdrive itself maintains the
 * real pooled connection to Postgres underneath, so creating a new Client
 * on the Worker side is cheap — it's not opening a new connection to your
 * database each time, just a new handle into Hyperdrive's existing pool.
 */
export async function createDb(env: Env) {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  return { db: drizzle(client, { schema }), client };
}

export type Db = Awaited<ReturnType<typeof createDb>>["db"];

interface DbCallContext {
  env: Env;
  // Typed as just the one method withDb actually calls, rather than the
  // full global `ExecutionContext` type — Hono's bundled ExecutionContext
  // type and @cloudflare/workers-types' version don't always match
  // exactly (e.g. a `tracing` field one has and the other doesn't), which
  // caused a type error here even though the real object is fine at
  // runtime. Structurally requiring just `waitUntil` sidesteps that.
  executionCtx: { waitUntil(promise: Promise<unknown>): void };
}

/**
 * Wraps a route handler's DB work so the `Client` is ALWAYS closed
 * afterward, success or failure.
 *
 * Why this exists: every route was calling `createDb(c.env)` and only
 * destructuring `db`, silently discarding `client`. That client was
 * never closed, so every request left one more open connection sitting
 * in Hyperdrive's pool. Enough of those piling up (retries, polling,
 * concurrent requests) exhausts the pool, and the next request that
 * needs a connection just hangs until it times out — this is exactly
 * the "Timed out while waiting for an open slot in the pool" error and
 * the intermittent 502s on /providers/offers.
 *
 * Cleanup runs via `c.executionCtx.waitUntil(client.end())` rather than
 * a plain `await` — this is Cloudflare's own documented pattern for
 * Hyperdrive + pg, and it matters here specifically: if the browser
 * cancels the request (closed tab, fast navigation, retry) before the
 * response is sent, the Workers runtime can tear down the request's
 * execution immediately, potentially skipping a plain `await` inside
 * `finally` entirely. `waitUntil` registers the cleanup with the
 * runtime itself, so it still runs (and the connection still gets
 * released) even if the client that made the request is long gone.
 *
 * Use this in every route instead of calling createDb directly:
 *
 *   return withDb(c, async (db) => {
 *     const rows = await db.select().from(table)...;
 *     return c.json(rows);
 *   });
 */
export async function withDb<T>(
  c: DbCallContext,
  fn: (db: Db) => Promise<T>
): Promise<T> {
  const { db, client } = await createDb(c.env);
  try {
    return await fn(db);
  } finally {
    c.executionCtx.waitUntil(client.end());
  }
}