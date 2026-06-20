import express from 'express';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import { RateLimitMiddleware } from '../api/middleware/rate-limit.middleware';
import { RateLimitService } from '../api/middleware/rate-limit.service';
import type { RedisService } from '../redis/redis.service';

/**
 * End-to-end style test: mount the real rate-limit middleware on an Express app
 * (the same primitives Nest uses under the hood) and drive it with supertest to
 * confirm a 429 is returned once the limit is exceeded, that the documented
 * headers are present, and that exempt routes are never throttled.
 */
function buildApp() {
  const client = new RedisMock();
  const redisService = { getClient: () => client } as unknown as RedisService;
  const service = new RateLimitService(redisService);
  const limiter = new RateLimitMiddleware(service);
  jest.spyOn((limiter as any).logger, 'warn').mockImplementation(() => undefined);

  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => limiter.use(req, res, next));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.post('/merchants/register', (_req, res) => res.json({ ok: true }));
  app.get('/v1/checkout/sessions/:id', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('rate limiting (integration)', () => {
  it('returns 429 with Retry-After when the per-IP limit is exceeded', async () => {
    const app = buildApp();
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
    expect(blocked.body).toMatchObject({ statusCode: 429, error: 'Too Many Requests' });
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(blocked.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('exempts /health from rate limiting', async () => {
    const app = buildApp();
    const agent = request(app);
    // Well above the 60/min default limit — proves /health is never throttled.
    for (let i = 0; i < 80; i++) {
      const res = await agent.get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    }
  }, 15000);
});
