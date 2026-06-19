/**
 * CORS + security-header configuration helpers.
 *
 * Kept framework-agnostic so the same logic powers both the Express middleware
 * and the unit tests.
 */

export const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
export const ALLOWED_HEADERS = 'Content-Type, Authorization, X-Request-Id';
export const MAX_AGE_SECONDS = '86400';

/**
 * Routes that are intentionally public and must accept requests from any origin.
 * The checkout status page is embedded on arbitrary merchant sites, so it cannot
 * be restricted to an allow-list.
 */
const PUBLIC_GET_ROUTE = /^\/v1\/checkout\/sessions\/[^/]+\/?$/;

export function isPublicCorsRoute(method: string, path: string): boolean {
  return method.toUpperCase() === 'GET' && PUBLIC_GET_ROUTE.test(path);
}

/**
 * Parse the comma-separated `CORS_ALLOWED_ORIGINS` env var.
 *
 * - Production: the variable is REQUIRED. An empty/missing value throws so the
 *   app crashes on startup rather than silently allowing nothing (or everything).
 * - Development: defaults to `http://localhost:3000`.
 */
export function resolveAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.CORS_ALLOWED_ORIGINS;
  const isProduction = env.NODE_ENV === 'production';

  const parsed = (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  if (parsed.length === 0) {
    if (isProduction) {
      throw new Error(
        'CORS_ALLOWED_ORIGINS must be set in production (comma-separated list of allowed origins).',
      );
    }
    return ['http://localhost:3000'];
  }

  return parsed;
}
