import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import type { Env } from "../types";

/**
 * Switched from `pg` (node-postgres) to `postgres.js` — this is
 * Cloudflare's OTHER officially-documented Hyperdrive driver, and unlike
 * `pg`, it's built natively for edge/serverless runtimes rather than
 * retrofitted onto one. This replaced a `pg`-based version that looked
 * correct (Client + explicit connect + explicit close via
 * `waitUntil(client.end())`, matching Cloudflare's own `pg` example
 * exactly) but still produced real, reproducible "Timed out while waiting
 * for an open slot in the pool" errors in production — `pg` has
 * documented, hard-to-pin-down incompatibilities with the Workers TCP
 * socket implementation around connection lifecycle (see
 * github.com/cloudflare/workers-sdk/issues/6179), and `client.end()`
 * appears not to reliably release the connection back to Hyperdrive's
 * pool in that environment even when called correctly.
 *
 * `max: 1` is deliberate and important: each Worker request gets exactly
 * one underlying connection through Hyperdrive, and it's this driver's
 * own internal pooling we're disabling (max defaults higher) — Hyperdrive
 * is what actually pools/reuses the real connection to Postgres on
 * Cloudflare's side, so the driver here doesn't need to pool anything
 * itself; it just needs one connection per request.
 */
export async function createDb(env: Env) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1 });
  return { db: drizzle(client, { schema }), client };
}

export type Db = Awaited<ReturnType<typeof createDb>>["db"];

interface DbCallContext {
  env: Env;
  executionCtx: { waitUntil(promise: Promise<unknown>): void };
}

/**
 * Wraps a route handler's DB work so the connection is ALWAYS closed
 * afterward, success or failure. Cleanup runs via
 * `c.executionCtx.waitUntil(client.end())` rather than a plain `await`,
 * since a cancelled request can have its execution torn down before a
 * plain `await` inside `finally` finishes — `waitUntil` registers the
 * cleanup with the runtime itself so it still runs.
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
