import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { decodeJwt } from "jose";
import type { Env } from "../types";

/**
 * Cloudflare's native Rate Limiting binding (not slowapi — that's a
 * Starlette-specific package with no Workers equivalent). Each binding is
 * pre-configured in wrangler.jsonc with a fixed limit+period, since the
 * binding itself carries the rule — there's no runtime "give me N per
 * minute" call the way slowapi's @limiter.limit("10/minute") decorator
 * allowed, so each distinct limit needs its own named binding.
 *
 * Keyed by user ID when the request carries a bearer token (so it follows
 * the person, not just their IP — many users share one IP on mobile
 * networks/NAT), falling back to IP address otherwise. Same as the
 * Python version, this only *decodes* the JWT to read `sub` — it doesn't
 * verify the signature. That's still requireAuth's job on the route
 * itself; worst case if this claim is forged, the attacker just
 * rate-limits themselves under a key of their choosing, which isn't a
 * real bypass since the endpoint still rejects the forged token separately.
 */
function rateLimitKey(c: Context): string {
  const authHeader = c.req.header("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    try {
      const claims = decodeJwt(authHeader.slice(7));
      if (claims.sub) return `user:${claims.sub}`;
    } catch {
      // fall through to IP-based keying
    }
  }
  return `ip:${c.req.header("cf-connecting-ip") ?? "unknown"}`;
}

export function rateLimit(bindingName: keyof Env) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const limiter = c.env[bindingName] as RateLimit | undefined;
    if (!limiter) {
      // Binding not configured (e.g. running `wrangler dev` without it
      // set up yet) — fail open rather than 500ing every request during
      // local development.
      console.warn(`Rate limit binding "${String(bindingName)}" not configured — skipping`);
      return next();
    }

    const { success } = await limiter.limit({ key: rateLimitKey(c) });
    if (!success) {
      throw new HTTPException(429, { message: "Too many requests — slow down and try again shortly." });
    }
    return next();
  };
}
