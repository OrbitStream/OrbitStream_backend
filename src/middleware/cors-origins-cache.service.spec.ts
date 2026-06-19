jest.mock('../db/index', () => ({
  db: {
    query: {
      merchants: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ corsOrigins: [] }),
      },
    },
    insert: jest.fn(),
    update: jest.fn(),
  },
  client: {},
  schema: {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { CorsOriginsCacheService } from './cors-origins-cache.service';
import { RedisService } from '../redis/redis.service';

describe('CorsOriginsCacheService', () => {
  let service: CorsOriginsCacheService;
  let redis: { getClient: jest.Mock };

  beforeEach(async () => {
    redis = {
      getClient: jest.fn().mockReturnValue({
        pipeline: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([]),
        }),
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CorsOriginsCacheService, { provide: RedisService, useValue: redis }],
    }).compile();

    service = module.get<CorsOriginsCacheService>(CorsOriginsCacheService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('returns empty array when no origins cached and no merchant found', async () => {
    const origins = await service.getMerchantOrigins('nonexistent-id');
    expect(origins).toEqual([]);
  });

  it('caches and returns origins from Redis', async () => {
    redis.getClient().get = jest.fn().mockResolvedValue(JSON.stringify(['https://shop.com']));
    const origins = await service.getMerchantOrigins('merchant-1');
    expect(origins).toEqual(['https://shop.com']);
  });

  it('returns empty array for all merchant origins when none cached', async () => {
    const origins = await service.getAllMerchantOrigins();
    expect(origins).toEqual([]);
  });
});
