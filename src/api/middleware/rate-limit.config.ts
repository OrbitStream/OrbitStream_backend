import type { Request } from 'express';

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

  // Auth: tight per-IP limit on credential endpoints.
  if (path === '/auth/verify') {
    return { name: 'auth', limit: 5, scope: 'ip' };
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
