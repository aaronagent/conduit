import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

declare module "hono" {
  interface ContextVariableMap {
    keyName: string;
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i]! ^ bufB[i]!;
  }
  return result === 0;
}

// ---------------------------------------------------------------------------
// Shared 401 response helper
// ---------------------------------------------------------------------------

function unauthorized(c: Context, message: string) {
  return c.json(
    { error: { type: "authentication_error", message } },
    401,
  );
}

// ---------------------------------------------------------------------------
// apiKeyAuth — strict auth for AI coding routes
// ---------------------------------------------------------------------------

export interface ApiKeyAuthOpts {
  envApiKey: string | null;
}

/**
 * Strict API key auth for AI coding routes (/v1/*, /chat/*).
 *
 * Token validation:
 * - ck- prefix → reserved for future DB key lookup
 * - other → timing-safe compare vs CONDUIT_API_KEY
 */
export function apiKeyAuth(opts: ApiKeyAuthOpts) {
  const { envApiKey } = opts;

  return createMiddleware(async (c, next) => {
    // If no API key configured, allow all requests (dev mode)
    if (!envApiKey) {
      c.set("keyName", "dev");
      await next();
      return;
    }

    const authHeader = c.req.header("Authorization");
    const xApiKey = c.req.header("x-api-key");

    let token: string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (xApiKey) {
      token = xApiKey;
    }

    if (!token) {
      return unauthorized(c, "Missing or invalid authentication credentials");
    }

    // ck- prefix → reserved for future DB key lookup
    if (token.startsWith("ck-")) {
      return unauthorized(c, "DB keys not yet implemented");
    }

    // env key timing-safe compare
    if (timingSafeEqual(token, envApiKey)) {
      c.set("keyName", "env:default");
      await next();
      return;
    }

    return unauthorized(c, "Invalid API key");
  });
}

// ---------------------------------------------------------------------------
// dashboardAuth — management routes with dev mode for bootstrap
// ---------------------------------------------------------------------------

export interface DashboardAuthOpts {
  envApiKey: string | null;
  internalKey: string | null;
}

/**
 * Dashboard management auth for /api/* routes.
 *
 * Dev mode: when neither CONDUIT_API_KEY nor CONDUIT_INTERNAL_KEY is set,
 * all requests are allowed without auth.
 */
export function dashboardAuth(opts: DashboardAuthOpts) {
  const { envApiKey, internalKey } = opts;

  return createMiddleware(async (c, next) => {
    // Dev mode: no env keys configured → always allow
    if (!envApiKey && !internalKey) {
      c.set("keyName", "dev");
      await next();
      return;
    }

    const authHeader = c.req.header("Authorization");
    const xApiKey = c.req.header("x-api-key");

    let token: string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (xApiKey) {
      token = xApiKey;
    }

    if (!token) {
      return unauthorized(c, "Missing or invalid authentication credentials");
    }

    if (envApiKey && timingSafeEqual(token, envApiKey)) {
      c.set("keyName", "env:default");
      await next();
      return;
    }

    if (internalKey && timingSafeEqual(token, internalKey)) {
      c.set("keyName", "internal");
      await next();
      return;
    }

    return unauthorized(c, "Invalid API key");
  });
}
