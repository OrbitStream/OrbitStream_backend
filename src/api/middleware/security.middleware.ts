import type { Request, Response, NextFunction } from 'express';
import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  MAX_AGE_SECONDS,
  isPublicCorsRoute,
  resolveAllowedOrigins,
} from './cors.config';

/**
 * Express middleware implementing dynamic CORS, preflight handling and baseline
 * security headers.
 *
 * Behaviour:
 *  - Reflects the request `Origin` back in `Access-Control-Allow-Origin` (never
 *    `*`) when it is in the allow-list, OR for the public checkout-status route
 *    (which is reachable from any merchant site).
 *  - Always sets the methods / headers / max-age preflight metadata.
 *  - Short-circuits `OPTIONS` preflight requests with `204`.
 *  - Adds HSTS, `X-Content-Type-Options` and `X-Frame-Options` to every response.
 *
 * Origins are resolved once at construction so a production misconfiguration
 * crashes the app at startup (see `resolveAllowedOrigins`).
 */
export function createSecurityMiddleware(env: NodeJS.ProcessEnv = process.env) {
  const allowedOrigins = resolveAllowedOrigins(env);
  const allowAllSet = allowedOrigins.includes('*');

  return function securityMiddleware(req: Request, res: Response, next: NextFunction): void {
    // --- Security headers (applied to every response) ---
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    // --- CORS ---
    const origin = req.headers.origin;
    const isPublic = isPublicCorsRoute(req.method, req.path);

    if (isPublic) {
      // Public checkout-status route: allow any origin. Reflect the caller's
      // origin when present so credentials-mode requests still work.
      res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
      if (origin) res.setHeader('Vary', 'Origin');
    } else if (origin && (allowAllSet || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    res.setHeader('Access-Control-Max-Age', MAX_AGE_SECONDS);

    // --- Preflight ---
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Content-Length', '0');
      res.end();
      return;
    }

    next();
  };
}
