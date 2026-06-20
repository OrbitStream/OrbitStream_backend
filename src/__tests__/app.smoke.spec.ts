import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmHealthIndicator } from '@nestjs/terminus';
import request from 'supertest';
import { AppModule } from '../app.module';
import { CorsOriginsCacheService } from '../middleware/cors-origins-cache.service';
import { RedisService } from '../redis/redis.service';

jest.mock('@nestjs/typeorm', () => {
  const actual = jest.requireActual('@nestjs/typeorm');

  return {
    ...actual,
    TypeOrmModule: {
      ...actual.TypeOrmModule,
      forRoot: jest.fn(() => ({
        module: class MockTypeOrmModule {},
      })),
    },
  };
});

describe('App smoke test', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TypeOrmHealthIndicator)
      .useValue({
        pingCheck: jest.fn().mockResolvedValue({
          database: {
            status: 'up',
          },
        }),
      })
      .overrideProvider(RedisService)
      .useValue({
        getClient: jest.fn(),
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
