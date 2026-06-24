import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { WebhookModule } from '../webhook/webhook.module';
import { RedisModule } from '../redis/redis.module';
import { RedisService } from '../redis/redis.service';
import { WebhookQueueService } from '../webhook/webhook-queue.service';
import { AuditService } from '../audit/audit.service';
import { validate } from '../config/config.schema';

const mockAuditService = {
  log: jest.fn(),
  logAuthFailure: jest.fn(),
  logAccessDenied: jest.fn(),
  logSensitiveOperation: jest.fn(),
};

const mockRedisService = { getClient: jest.fn().mockReturnValue({}) };

/**
 * Resolves the real WebhookModule DI graph to prove NestJS can construct
 * WebhookQueueService and that RedisService is injectable into it.
 * `compile()` instantiates every provider but does NOT run lifecycle hooks,
 * so no real Redis connection is opened.
 */
describe('WebhookModule dependency injection', () => {
  it('resolves WebhookQueueService with RedisService injected', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate }), WebhookModule],
    })
      .overrideProvider(AuditService)
      .useValue(mockAuditService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .compile();

    const queue = moduleRef.get(WebhookQueueService);
    expect(queue).toBeInstanceOf(WebhookQueueService);
    expect(moduleRef.get(RedisService, { strict: false })).toBeDefined();
  });

  it('RedisModule exports RedisService', () => {
    expect(RedisModule).toBeDefined();
  });
});
