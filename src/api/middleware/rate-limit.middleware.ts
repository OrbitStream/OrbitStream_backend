import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { RateLimitService } from './rate-limit.service';
import {
  authMultiplier,
  isExempt,
  rateLimitIdentity,
  resolveAuthTier,
  resolveRule,
} from './rate-limit.config';

/**
 * Global sliding-window rate-limiting middleware.
 *
 * - Resolves the per-endpoint rule (limit + scope) and identity (IP or API key).
 * - Scales the base limit by the caller's auth tier (1x/2x/5x/10x).
 * - Skips `/health` and `/metrics`.
 * - Halves the limit when running in the degraded (in-memory) fallback.
 * - Emits `X-RateLimit-*` headers, and on breach returns `429` with `Retry-After`.
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);

  constructor(private readonly rateLimiter: RateLimitService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (isExempt(req.path)) {
      return next();
    }

    const rule = resolveRule(req.method, req.path);
    const identity = rateLimitIdentity(req, rule);
    const keyspace = `${rule.name}:${identity}`;

    // Effective limit = base endpoint limit × auth-tier multiplier.
    const tier = resolveAuthTier(req);
    const limit = Math.round(rule.limit * authMultiplier(tier));

    // The service applies the effective limit when Redis is healthy and
    // automatically falls back to 50% of the limit (in-memory) when it is not.
    const result = await this.rateLimiter.check(keyspace, limit);

    res.setHeader('X-RateLimit-Limit', String(result.limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(result.resetSeconds));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      this.logger.warn(`Rate limit exceeded for ${keyspace} (limit ${result.limit}/min)`);
      res.status(429).json({
        statusCode: 429,
        message: 'Rate limit exceeded',
        error: 'Too Many Requests',
        retryAfter: result.retryAfterSeconds,
      });
      return;
    }

    next();
  }
}
