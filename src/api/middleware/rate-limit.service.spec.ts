import RedisMock from 'ioredis-mock';
import { RateLimitService } from './rate-limit.service';
import type { RedisService } from '../../redis/redis.service';

function serviceWithClient(client: any): RateLimitService {
  const redisService = { getClient: () => client } as unknown as RedisService;
  return new RateLimitService(redisService);
}

describe('RateLimitService (Redis backend)', () => {
  let client: any;
  let service: RateLimitService;

  beforeEach(() => {
    client = new RedisMock();
    service = serviceWithClient(client);
  });

  afterEach(async () => {
    await client.flushall();
  });

  it('allows requests within the limit and decrements remaining', async () => {
    const a = await service.check('test:ip:1.1.1.1', 3);
    expect(a.allowed).toBe(true);
    expect(a.limit).toBe(3);
    expect(a.remaining).toBe(2);
    expect(a.degraded).toBe(false);

    const b = await service.check('test:ip:1.1.1.1', 3);
    expect(b.allowed).toBe(true);
    expect(b.remaining).toBe(1);
  });

  it('allows exactly up to the limit, then blocks (at limit / over limit)', async () => {
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await service.check('test:ip:2.2.2.2', 3));
    }
    expect(results.slice(0, 3).every((r) => r.allowed)).toBe(true);
    expect(results[2].remaining).toBe(0); // at limit, last allowed request
    expect(results[3].allowed).toBe(false); // over limit
    expect(results[3].remaining).toBe(0);
    expect(results[3].retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('keys independently per identity', async () => {
    await service.check('test:ip:a', 1);
    const blockedA = await service.check('test:ip:a', 1);
    const allowedB = await service.check('test:ip:b', 1);
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });

  it('exposes a reset timestamp roughly one window in the future', async () => {
    const r = await service.check('test:ip:reset', 5);
    const nowSec = Math.floor(Date.now() / 1000);
    expect(r.resetSeconds).toBeGreaterThan(nowSec);
    expect(r.resetSeconds).toBeLessThanOrEqual(nowSec + 61);
  });
});

describe('RateLimitService (graceful degradation)', () => {
  it('falls back to in-memory limiting at 50% when no client is available', async () => {
    const service = serviceWithClient(null);
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

    // Normal limit 4 -> degraded limit 2.
    const a = await service.check('deg:ip:1', 4);
    const b = await service.check('deg:ip:1', 4);
    const c = await service.check('deg:ip:1', 4);

    expect(a.degraded).toBe(true);
    expect(a.limit).toBe(2);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(false); // blocked at the halved limit
    warn.mockRestore();
  });

  it('falls back when the client throws on eval and logs a warning', async () => {
    const throwingClient = {
      status: 'ready',
      eval: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const service = serviceWithClient(throwingClient);
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

    const r = await service.check('deg:ip:throw', 10);
    expect(r.degraded).toBe(true);
    expect(r.limit).toBe(5); // 50% of 10
    expect(r.allowed).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('falling back to in-memory'));
    warn.mockRestore();
  });

  it('treats a non-ready client status as unavailable', async () => {
    const notReady = {
      status: 'connecting',
      eval: jest.fn(),
    };
    const service = serviceWithClient(notReady);
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

    const r = await service.check('deg:ip:notready', 8);
    expect(r.degraded).toBe(true);
    expect(notReady.eval).not.toHaveBeenCalled();
  });
});
