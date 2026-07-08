import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { CorsOriginsCacheService } from '../middleware/cors-origins-cache.service';
import { PaymentDetectorService } from '../payments/payment-detector.service';
import { RedisService } from '../redis/redis.service';

jest.mock('../db/index', () => ({
  db: {
    execute: jest.fn().mockResolvedValue([]),
    query: {},
  },
  client: {},
  schema: {},
}));

describe('App smoke test', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const redisClient = {
      get: jest.fn().mockResolvedValue(null),
      lrange: jest.fn().mockResolvedValue([]),
      set: jest.fn().mockResolvedValue('OK'),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useValue({
        getClient: jest.fn(() => redisClient),
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .overrideProvider(PaymentDetectorService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .overrideProvider(CorsOriginsCacheService)
      .useValue({
        getAllMerchantOrigins: jest.fn().mockResolvedValue([]),
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('should be defined', () => {
    expect(app).toBeDefined();
  });

  it('should have health endpoint', () => {
    return request(app.getHttpServer()).get('/health').expect(200);
  });
});
