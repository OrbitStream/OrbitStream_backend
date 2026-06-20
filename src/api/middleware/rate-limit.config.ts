import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { resolveJwtSecrets } from '../../config/jwt-secret.config';

export const WINDOW_MS = 60_000; // 1 minute sliding window

export type RateLimitScope = 'ip' | 'apiKey';

export interface RateLimitRule {
  /** Human-readable identifier used in the Redis key namespace. */
  name: string;
  /** Allowed requests per window. */
  limit: number;
  /** Whether the limit is keyed by client IP or by API key. */
  scope: RateLimitScope;
}

/** Endpoints that bypass rate limiting entirely. */
const EXEMPT_PREFIXES = ['/health', '/metrics'];

export function isExempt(path: string): boolean {
  return EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

const GET_CHECKOUT_SESSION = /^\/v1\/checkout\/sessions\/[^/]+\/?$/;
const CHECKOUT_SESSIONS = /^\/v1\/checkout\/sessions\/?$/;

/**
 * Resolve the rate-limit rule for a request.
 *
 * Order matters: more specific routes are matched before the catch-all.
 */
export function resolveRule(method: string, path: string): RateLimitRule {
  const m = method.toUpperCase();

  // Auth: tight per-IP limits on credential endpoints. Login is the most
  // brute-forceable, so it gets the tightest limit; verify is slightly looser.
  if (path === '/auth/login') {
    return { name: 'auth-login', limit: 5, scope: 'ip' };
  }
  if (path === '/auth/verify') {
    return { name: 'auth-verify', limit: 10, scope: 'ip' };
  }

  // Merchant registration: very tight per-IP limit (anti-abuse).
  if (path === '/merchants/register') {
    return { name: 'merchants-register', limit: 3, scope: 'ip' };
  }

  // Checkout session creation: per-API-key (programmatic, higher limit).
  if (m === 'POST' && CHECKOUT_SESSIONS.test(path)) {
    return { name: 'checkout-create', limit: 100, scope: 'apiKey' };
  }

  // Public checkout-status reads: per-IP.
  if (m === 'GET' && GET_CHECKOUT_SESSION.test(path)) {
    return { name: 'checkout-get', limit: 60, scope: 'ip' };
  }

  // Default: per-IP.
  return { name: 'default', limit: 60, scope: 'ip' };
}

/** Extract the client IP, honouring the first `X-Forwarded-For` hop. */
export function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  if (Array.isArray(fwd) && fwd.length > 0) {
    return fwd[0].split(',')[0].trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

/** Extract the API key (bearer token) used to key API-scoped limits. */
export function apiKey(req: Request): string | undefined {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return undefined;
}

/**
 * Build the rate-limit identity for a request. API-key-scoped rules fall back to
 * IP when no key is present so unauthenticated callers are still limited.
 */
export function rateLimitIdentity(req: Request, rule: RateLimitRule): string {
  if (rule.scope === 'apiKey') {
    const key = apiKey(req);
    if (key) return `key:${key}`;
  }
  return `ip:${clientIp(req)}`;
}

/**
 * Caller authentication tier. Authenticated callers earn a higher ceiling than
 * anonymous traffic, and trusted API/admin callers higher still.
 */
export type AuthTier = 'unauthenticated' | 'jwt' | 'apiKey' | 'admin';

/** Per-auth-type multipliers applied on top of the base per-endpoint limit. */
const AUTH_MULTIPLIERS: Record<AuthTier, number> = {
  unauthenticated: 1,
  jwt: 2,
  apiKey: 5,
  admin: 10,
};

export function authMultiplier(tier: AuthTier): number {
  return AUTH_MULTIPLIERS[tier];
}

/**
 * Classify a request's auth tier from the `Authorization` header alone — no
 * database round-trips on the hot path:
 *
 *   - API secret keys carry the `sk_` prefix            → apiKey (5x)
 *   - A verifiable JWT carrying an `admin` role claim    → admin  (10x)
 *   - Any other verifiable JWT                           → jwt    (2x)
 *   - No / invalid credentials                           → unauthenticated (1x)
 */
export function resolveAuthTier(req: Request): AuthTier {
  const token = apiKey(req);
  if (!token) return 'unauthenticated';
  if (token.startsWith('sk_')) return 'apiKey';

  const claims = verifyJwt(token);
  if (!claims) return 'unauthenticated';
  return claims.role === 'admin' ? 'admin' : 'jwt';
}

/**
 * Verify a bearer token against the active (and, during rotation, previous) JWT
 * secret. Returns the decoded claims, or `null` when the token is not a valid
 * JWT. Never throws — an unverifiable token simply falls back to the anonymous
 * tier.
 */
function verifyJwt(token: string): { role?: string } | null {
  let secrets;
  try {
    secrets = resolveJwtSecrets();
  } catch {
    return null;
  }
  for (const secret of [secrets.current, secrets.previous]) {
    if (!secret) continue;
    try {
      return jwt.verify(token, secret) as { role?: string };
    } catch {
      // Try the next secret (rotation window) before giving up.
    }
  }
  return null;
}
