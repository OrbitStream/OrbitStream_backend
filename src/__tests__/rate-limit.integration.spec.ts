import express from 'express';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import { RateLimitMiddleware } from '../api/middleware/rate-limit.middleware';
import { RateLimitService } from '../api/middleware/rate-limit.service';
import { AdaptiveLimitService } from '../api/middleware/adaptive-limit.service';
import type { MerchantsService } from '../merchants/merchants.service';
import type { RedisService } from '../redis/redis.service';

/**
 * End-to-end style tests: mount the real rate-limit middleware on an Express app
 * (the same primitives Nest uses under the hood) and drive it with supertest to
 * confirm the documented behaviour — 429s on breach, the standard headers,
 * exempt routes, per-auth-type multipliers, the adaptive bonus, graceful
 * degradation, and that the limit holds under concurrency.
 */
interface AppOptions {
  /** When false, the Redis client reports a non-ready status (forces fallback). */
  redisReady?: boolean;
  /** Map of API key -> merchant id resolved by the stub MerchantsService. */
  merchants?: Record<string, string>;
}

function buildApp(opts: AppOptions = {}) {
  const { redisReady = true, merchants: keyToMerchant = {} } = opts;

  const client: any = new RedisMock();
  if (!redisReady) {
    // Make the limiter treat Redis as unavailable -> in-memory fallback at 50%.
    client.status = 'connecting';
  }
  const redisService = { getClient: () => client } as unknown as RedisService;

  const service = new RateLimitService(redisService);
  const adaptive = new AdaptiveLimitService(redisService);
  const merchants = {
    validateApiKey: jest.fn(async (key: string) => keyToMerchant[key] ?? null),
  } as unknown as MerchantsService;

  const limiter = new RateLimitMiddleware(service, adaptive, merchants);
  jest.spyOn((limiter as any).logger, 'warn').mockImplementation(() => undefined);

  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => limiter.use(req, res, next));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.post('/merchants/register', (_req, res) => res.json({ ok: true }));
  app.get('/merchants/me', (_req, res) => res.json({ ok: true }));
  app.post('/v1/checkout/sessions', (_req, res) => res.json({ ok: true }));
  app.get('/v1/checkout/sessions/:id', (_req, res) => res.json({ ok: true }));
  return { app, adaptive, limiter };
}

/** Minimal Express-shaped request/response pair for driving the middleware directly. */
function fakeExchange(method: string, path: string, ip: string) {
  const req = {
    method,
    path,
    ip,
    headers: { 'x-forwarded-for': ip },
    socket: { remoteAddress: ip },
  } as any;
  let statusCode = 200;
  const res = {
    setHeader: () => res,
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: () => res,
  } as any;
  return {
    req,
    res,
    get statusCode() {
      return statusCode;
    },
  };
}

describe('rate limiting (integration)', () => {
  it('returns 429 with the documented body once the per-IP limit is exceeded', async () => {
    const { app } = buildApp();
    const agent = request(app);
    const ip = '203.0.113.7';

    // /merchants/register limit is 3/min per IP.
    for (let i = 0; i < 3; i++) {
      const ok = await agent.post('/merchants/register').set('X-Forwarded-For', ip);
      expect(ok.status).toBe(200);
      expect(ok.headers['x-ratelimit-limit']).toBe('3');
    }

    const blocked = await agent.post('/merchants/register').set('X-Forwarded-For', ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      statusCode: 429,
      message: 'Rate limit exceeded',
      error: 'Too Many Requests',
      retryAfter: expect.any(Number),
    });
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(blocked.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('exempts /health from rate limiting', async () => {
    const { app } = buildApp();
    const agent = request(app);
    // Well above the 60/min default limit — proves /health is never throttled.
    for (let i = 0; i < 80; i++) {
      const res = await agent.get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    }
  }, 15000);

  describe('per-auth-type multipliers', () => {
    it('gives an anonymous caller the 1x base limit', async () => {
      const { app } = buildApp();
      const res = await request(app).get('/merchants/me').set('X-Forwarded-For', '198.51.100.1');
      expect(res.headers['x-ratelimit-limit']).toBe('60');
    });

    it('gives an API-key caller 5x the base limit', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .get('/merchants/me')
        .set('X-Forwarded-For', '198.51.100.2')
        .set('Authorization', 'Bearer sk_test_abc');
      expect(res.headers['x-ratelimit-limit']).toBe('300'); // 60 × 5
    });
  });

  describe('adaptive limits', () => {
    it('raises the checkout-creation limit by 50% for a high-volume merchant', async () => {
      const apiKey = 'sk_test_busy';
      const { app, adaptive } = buildApp({ merchants: { [apiKey]: 'merchant-busy' } });

      // Drive the merchant above the hourly payment threshold.
      for (let i = 0; i < 11; i++) {
        await adaptive.recordPayment('merchant-busy');
      }

      const res = await request(app)
        .post('/v1/checkout/sessions')
        .set('X-Forwarded-For', '198.51.100.3')
        .set('Authorization', `Bearer ${apiKey}`);

      // Base 100 × apiKey 5x × adaptive 1.5 = 750.
      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('750');
    });

    it('keeps the base checkout limit for a low-volume merchant', async () => {
      const apiKey = 'sk_test_quiet';
      const { app } = buildApp({ merchants: { [apiKey]: 'merchant-quiet' } });

      const res = await request(app)
        .post('/v1/checkout/sessions')
        .set('X-Forwarded-For', '198.51.100.4')
        .set('Authorization', `Bearer ${apiKey}`);

      // Base 100 × apiKey 5x, no adaptive bonus = 500.
      expect(res.headers['x-ratelimit-limit']).toBe('500');
    });
  });

  describe('graceful degradation', () => {
    it('falls back to in-memory limiting at 50% of the limit when Redis is down', async () => {
      const { app } = buildApp({ redisReady: false });
      const agent = request(app);
      const ip = '198.51.100.5';

      // /merchants/register base limit 3 -> 50% (floored) -> 1 in-memory.
      const first = await agent.post('/merchants/register').set('X-Forwarded-For', ip);
      const second = await agent.post('/merchants/register').set('X-Forwarded-For', ip);

      expect(first.status).toBe(200);
      expect(first.headers['x-ratelimit-limit']).toBe('1');
      expect(second.status).toBe(429);
    });
  });

  describe('concurrency / load', () => {
    it('holds the limit under 100 concurrent requests (no burst past the cap)', async () => {
      const { limiter } = buildApp();
      const ip = '198.51.100.6';

      // Default route, anonymous → 60/min. Fire 100 requests at once through the
      // real middleware (the atomic sliding window must not let the burst past 60).
      const exchanges = Array.from({ length: 100 }, () => fakeExchange('GET', '/merchants/me', ip));
      await Promise.all(exchanges.map((ex) => limiter.use(ex.req, ex.res, () => undefined)));

      const allowed = exchanges.filter((ex) => ex.statusCode === 200).length;
      const blocked = exchanges.filter((ex) => ex.statusCode === 429).length;

      expect(allowed).toBe(60);
      expect(blocked).toBe(40);
    }, 20000);
  });
});
