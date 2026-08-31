import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { jwtVerify, createRemoteJWKSet, decodeProtectedHeader } from "jose";
import { eq } from "drizzle-orm";
import type { Env } from "../types";
import { getSettings } from "../lib/config";
import { withDb, type Db } from "../db/client";
import { wallets } from "../db/schema";

export interface CurrentUser {
  id: string; // uuid
  email: string;
  walletBalanceNgn: number;
  isAdmin: boolean;
  isSuspended: boolean;
}

// createRemoteJWKSet handles its own caching + key-rotation retry
// internally (this is exactly what the Python version's hand-rolled
// _jwks_cache + force_refresh dance was doing manually) — one process-wide
// instance per Supabase project URL, reused across requests/isolates.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(supabaseUrl: string) {
  let jwks = jwksCache.get(supabaseUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
    jwksCache.set(supabaseUrl, jwks);
  }
  return jwks;
}

async function verifySupabaseJwt(token: string, env: Env): Promise<Record<string, any>> {
  const header = decodeProtectedHeader(token);

  if (header.alg === "HS256") {
    if (!env.SUPABASE_JWT_SECRET) {
      throw new Error("SUPABASE_JWT_SECRET is not set but this token is HS256-signed");
    }
    const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { audience: "authenticated" });
    return payload;
  }

  // Asymmetric project (ES256/RS256) — verified via JWKS, no shared secret.
  const jwks = getJwks(getSettings(env).supabaseUrl);
  const { payload } = await jwtVerify(token, jwks, { audience: "authenticated" });
  return payload;
}

const credentialsError = () =>
  new HTTPException(401, { message: "Could not validate credentials" });

/**
 * Hono middleware — verifies the bearer token, ensures a wallet row exists
 * (mirrors get_or_create_wallet), and attaches CurrentUser to context under
 * "user". Suspended accounts are rejected here, same as before.
 *
 * The DB work is scoped inside withDb so the connection closes BEFORE
 * next() runs — this middleware fires on nearly every request, so leaving
 * its connection open for the lifetime of the downstream handler too would
 * roughly double how long each request holds a slot in Hyperdrive's pool.
 */
export async function requireAuth(c: Context<{ Bindings: Env; Variables: { user: CurrentUser } }>, next: Next) {
  const authHeader = c.req.header("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    throw credentialsError();
  }
  const token = authHeader.slice(7);

  let payload: Record<string, any>;
  try {
    payload = await verifySupabaseJwt(token, c.env);
  } catch (e) {
    console.warn("JWT verification failed:", e);
    throw credentialsError();
  }

  const sub = payload.sub as string | undefined;
  const email = payload.email as string | undefined;
  if (!sub || !email) {
    console.warn("Token verified but missing sub/email claims:", payload);
    throw credentialsError();
  }

  // Very loose UUID shape check — same purpose as Python's uuid.UUID(sub)
  // parse-and-reject, without pulling in a UUID validation library for it.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)) {
    throw credentialsError();
  }

  const settings = getSettings(c.env);

  const { isAdmin, isSuspended, walletBalanceNgn } = await withDb(c, async (db) => {
    const wallet = await getOrCreateWallet(db, sub, email);
    const isAdmin = wallet.isAdmin || settings.adminEmails.has(email.toLowerCase());
    return { isAdmin, isSuspended: wallet.isSuspended, walletBalanceNgn: wallet.walletBalanceNgn };
  });

  if (isSuspended) {
    throw new HTTPException(403, { message: "This account has been suspended. Contact support." });
  }

  c.set("user", {
    id: sub,
    email,
    walletBalanceNgn,
    isAdmin,
    isSuspended,
  });

  await next();
}

export function requireAdmin(c: Context<{ Variables: { user: CurrentUser } }>, next: Next) {
  const user = c.get("user");
  if (!user.isAdmin) {
    throw new HTTPException(403, { message: "Admin access required" });
  }
  return next();
}

/**
 * Normally a no-op — the Postgres trigger in supabase_schema.sql already
 * creates the wallet row at signup. This is the safety-net fallback for
 * local dev or a race where the backend is hit before the trigger commits,
 * same role as Python's get_or_create_wallet.
 */
export async function getOrCreateWallet(db: Db, userId: string, email?: string) {
  const existing = await db.query.wallets.findFirst({ where: eq(wallets.userId, userId) });
  if (!existing) {
    const [created] = await db
      .insert(wallets)
      .values({ userId, walletBalanceNgn: 0, email: email ?? null })
      .returning();
    return created;
  }
  if (email && existing.email !== email) {
    const [updated] = await db
      .update(wallets)
      .set({ email })
      .where(eq(wallets.userId, userId))
      .returning();
    return updated;
  }
  return existing;
}