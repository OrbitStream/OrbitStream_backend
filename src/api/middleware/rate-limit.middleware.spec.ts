import type { Request, Response } from 'express';
import RedisMock from 'ioredis-mock';
import { RateLimitMiddleware } from './rate-limit.middleware';
import { RateLimitService } from './rate-limit.service';
import type { RedisService } from '../../redis/redis.service';

function buildMiddleware() {
  const client = new RedisMock();
  const redisService = { getClient: () => client } as unknown as RedisService;
  const service = new RateLimitService(redisService);
  const middleware = new RateLimitMiddleware(service);
  // Silence the breach warning.
  jest.spyOn((middleware as any).logger, 'warn').mockImplementation(() => undefined);
  return { middleware, client };
}

function mockRes(): {
  res: Response;
  headers: Record<string, string>;
  status: jest.Mock;
  json: jest.Mock;
} {
  const headers: Record<string, string> = {};
  const status = jest.fn().mockReturnThis();
  const json = jest.fn().mockReturnThis();
  const res: any = {
    setHeader: (name: string, value: unknown) => {
      headers[name] = String(value);
      return res;
    },
    status,
    json,
  };
  return { res: res as Response, headers, status, json };
}

function mockReq(
  method: string,
  path: string,
  ip = '1.1.1.1',
  headers: Record<string, string> = {},
): Request {
  return {
    method,
    path,
    ip,
    headers: { 'x-forwarded-for': ip, ...headers },
    socket: { remoteAddress: ip },
  } as unknown as Request;
}

describe('RateLimitMiddleware', () => {
  it('skips exempt routes without setting headers', async () => {
    const { middleware } = buildMiddleware();
    const { res, headers } = mockRes();
    const next = jest.fn();
    await middleware.use(mockReq('GET', '/health'), res, next);
    expect(next).toHaveBeenCalled();
    expect(headers['X-RateLimit-Limit']).toBeUndefined();
  });

  it('sets X-RateLimit headers and calls next within the limit', async () => {
    const { middleware } = buildMiddleware();
    const { res, headers } = mockRes();
    const next = jest.fn();
    await middleware.use(mockReq('POST', '/auth/login'), res, next);

    expect(next).toHaveBeenCalled();
    expect(headers['X-RateLimit-Limit']).toBe('5');
    expect(headers['X-RateLimit-Remaining']).toBe('4');
    expect(headers['X-RateLimit-Reset']).toBeDefined();
  });

  it('returns 429 with Retry-After once the limit is exceeded', async () => {
    const { middleware } = buildMiddleware();
    const ip = '9.9.9.9';

    // /merchants/register has a limit of 3.
    for (let i = 0; i < 3; i++) {
      const { res } = mockRes();
      const next = jest.fn();
      await middleware.use(mockReq('POST', '/merchants/register', ip), res, next);
      expect(next).toHaveBeenCalled();
    }

    const { res, headers, status, json } = mockRes();
    const next = jest.fn();
    await middleware.use(mockReq('POST', '/merchants/register', ip), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      statusCode: 429,
      message: 'Rate limit exceeded',
      error: 'Too Many Requests',
      retryAfter: expect.any(Number),
    });
    expect(headers['Retry-After']).toBeDefined();
    expect(Number(headers['Retry-After'])).toBeGreaterThanOrEqual(1);
    expect(headers['X-RateLimit-Remaining']).toBe('0');
  });

  it('scales the base limit by the API-key auth multiplier (5x)', async () => {
    const { middleware } = buildMiddleware();
    const { res, headers } = mockRes();
    const next = jest.fn();

    // Default route base limit is 60; an API key (sk_) earns 5x → 300.
    await middleware.use(
      mockReq('GET', '/merchants/me', '4.4.4.4', { authorization: 'Bearer sk_test_abcdef' }),
      res,
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(headers['X-RateLimit-Limit']).toBe('300');
    expect(headers['X-RateLimit-Remaining']).toBe('299');
  });
});
