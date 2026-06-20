import RedisMock from 'ioredis-mock';
import {
  AdaptiveLimitService,
  ADAPTIVE_BONUS_MULTIPLIER,
  ADAPTIVE_PAYMENT_THRESHOLD,
} from './adaptive-limit.service';
import type { RedisService } from '../../redis/redis.service';

function serviceWithClient(client: any): AdaptiveLimitService {
  const redisService = { getClient: () => client } as unknown as RedisService;
  return new AdaptiveLimitService(redisService);
}

describe('AdaptiveLimitService', () => {
  let client: any;
  let service: AdaptiveLimitService;

  beforeEach(() => {
    client = new RedisMock();
    service = serviceWithClient(client);
  });

  afterEach(async () => {
    await client.flushall();
  });

  it('uses the documented counter key shape', () => {
    const key = AdaptiveLimitService.counterKey('merchant-1', 12345);
    expect(key).toBe('orbitstream:merchant_payments:merchant-1:12345');
  });

  it('starts merchants on the base limit (no bonus)', async () => {
    expect(await service.getCheckoutBonus('merchant-1')).toBe(1);
  });

  it('keeps the base limit at exactly the threshold', async () => {
    for (let i = 0; i < ADAPTIVE_PAYMENT_THRESHOLD; i++) {
      await service.recordPayment('merchant-1');
    }
    expect(await service.getCheckoutBonus('merchant-1')).toBe(1);
  });

  it('grants the +50% bonus once a merchant exceeds the threshold', async () => {
    for (let i = 0; i < ADAPTIVE_PAYMENT_THRESHOLD + 1; i++) {
      await service.recordPayment('merchant-1');
    }
    expect(await service.getCheckoutBonus('merchant-1')).toBe(ADAPTIVE_BONUS_MULTIPLIER);
  });

  it('counts each merchant independently', async () => {
    for (let i = 0; i < ADAPTIVE_PAYMENT_THRESHOLD + 1; i++) {
      await service.recordPayment('busy-merchant');
    }
    expect(await service.getCheckoutBonus('busy-merchant')).toBe(ADAPTIVE_BONUS_MULTIPLIER);
    expect(await service.getCheckoutBonus('quiet-merchant')).toBe(1);
  });

  it('sets a TTL on the counter so it self-expires', async () => {
    await service.recordPayment('merchant-1');
    const ttl = await client.ttl(AdaptiveLimitService.counterKey('merchant-1'));
    expect(ttl).toBeGreaterThan(0);
  });

  it('fails open to the base limit when Redis is unavailable', async () => {
    const offline = serviceWithClient(null);
    await expect(offline.recordPayment('merchant-1')).resolves.toBeUndefined();
    expect(await offline.getCheckoutBonus('merchant-1')).toBe(1);
  });
});
