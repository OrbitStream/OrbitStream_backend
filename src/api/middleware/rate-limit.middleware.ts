import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { RateLimitService } from './rate-limit.service';
import { AdaptiveLimitService } from './adaptive-limit.service';
import { MerchantsService } from '../../merchants/merchants.service';
import {
  apiKey,
  authMultiplier,
  isExempt,
  rateLimitIdentity,
  resolveAuthTier,
  resolveRule,
  type RateLimitRule,
} from './rate-limit.config';

/** Rule whose limit is eligible for the high-volume adaptive bonus. */
const ADAPTIVE_RULE = 'checkout-create';

/**
 * Global sliding-window rate-limiting middleware.
 *
 * - Resolves the per-endpoint rule (limit + scope) and identity (IP or API key).
 * - Scales the base limit by the caller's auth tier (1x/2x/5x/10x).
 * - Grants high-volume merchants a +50% checkout-creation bonus.
 * - Skips `/health` and `/metrics`.
 * - Halves the limit when running in the degraded (in-memory) fallback.
 * - Emits `X-RateLimit-*` headers, and on breach returns `429` with `Retry-After`.
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);

  constructor(
    private readonly rateLimiter: RateLimitService,
    private readonly adaptive: AdaptiveLimitService,
    private readonly merchants: MerchantsService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (isExempt(req.path)) {
      return next();
    }

    const rule = resolveRule(req.method, req.path);
    const identity = rateLimitIdentity(req, rule);
    const keyspace = `${rule.name}:${identity}`;

    // Effective limit = base endpoint limit × auth-tier multiplier × adaptive bonus.
    const tier = resolveAuthTier(req);
    const bonus = await this.adaptiveBonus(rule, req);
    const limit = Math.round(rule.limit * authMultiplier(tier) * bonus);

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

  /**
   * Resolve the adaptive checkout-creation bonus for a request. Only the
   * checkout-create rule is eligible; the bonus is keyed on the merchant behind
   * the API key. Fails open (returns `1`) for unrelated rules, anonymous callers
   * or any lookup error so rate limiting never blocks on the bonus path.
   */
  private async adaptiveBonus(rule: RateLimitRule, req: Request): Promise<number> {
    if (rule.name !== ADAPTIVE_RULE) return 1;

    const key = apiKey(req);
    if (!key) return 1;

    try {
      const merchantId = await this.merchants.validateApiKey(key);
      if (!merchantId) return 1;
      return await this.adaptive.getCheckoutBonus(merchantId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Adaptive bonus lookup failed, using base limit: ${msg}`);
      return 1;
    }
  }
}
