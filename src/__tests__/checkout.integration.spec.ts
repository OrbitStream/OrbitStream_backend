/**
 * Integration tests for the checkout session lifecycle.
 *
 * Uses @nestjs/testing with real NestJS DI: controller, pipes, and guards
 * wired through the NestJS lifecycle. All I/O dependencies are mocked so
 * no real database or Redis connection is required.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { CheckoutController } from '../checkout/checkout.controller';
import { CheckoutService } from '../checkout/checkout.service';
import { AuditService } from '../audit/audit.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ResourceOwnershipGuard } from '../auth/resource-ownership.guard';
import { MerchantsService } from '../merchants/merchants.service';

const MERCHANT_ID = 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';

const stubSession = {
  id: 'cccccccc-0000-4000-8000-cccccccccccc',
  url: 'https://checkout.example.com/checkout/cccccccc-0000-4000-8000-cccccccccccc',
  amount: '25.0000000',
  asset: 'USDC',
  status: 'pending' as const,
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
};

// Guard that always passes and injects a fixed merchantId
const passThroughApiKeyGuard = {
  canActivate: (ctx: any) => {
    ctx.switchToHttp().getRequest().merchantId = MERCHANT_ID;
    return true;
  },
};

const passThroughGuard = { canActivate: () => true };

const mockCheckoutService = {
  createSession: jest.fn(),
  getSession: jest.fn(),
  cancelSession: jest.fn(),
};

const mockMerchantsService = {
  validateApiKey: jest.fn().mockResolvedValue(MERCHANT_ID),
  findById: jest.fn(),
};

describe('Checkout session lifecycle (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckoutController],
      providers: [
        { provide: CheckoutService, useValue: mockCheckoutService },
        { provide: AuditService, useValue: { logSensitiveOperation: jest.fn() } },
        { provide: MerchantsService, useValue: mockMerchantsService },
        Reflector,
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue(passThroughApiKeyGuard)
      .overrideGuard(RolesGuard)
      .useValue(passThroughGuard)
      .overrideGuard(ResourceOwnershipGuard)
      .useValue(passThroughGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckoutService.createSession.mockResolvedValue(stubSession);
    mockCheckoutService.getSession.mockResolvedValue(stubSession);
    mockCheckoutService.cancelSession.mockResolvedValue({ ...stubSession, status: 'cancelled' });
  });

  // ── Create session ──────────────────────────────────────────────────────────

  describe('POST /v1/checkout/sessions — create checkout session', () => {
    it('returns 201 with session id and URL', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/checkout/sessions')
        .set('Authorization', 'Bearer sk_test_dummy')
        .send({ amount: 25, asset: 'USDC' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: stubSession.id, status: 'pending' });
      expect(res.body.url).toContain('/checkout/');
      expect(mockCheckoutService.createSession).toHaveBeenCalledWith(
        MERCHANT_ID,
        expect.objectContaining({ amount: 25, asset: 'USDC' }),
      );
    });

    it('returns 400 when amount is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/checkout/sessions')
        .set('Authorization', 'Bearer sk_test_dummy')
        .send({ asset: 'USDC' });

      expect(res.status).toBe(400);
      expect(mockCheckoutService.createSession).not.toHaveBeenCalled();
    });

    it('returns 400 when asset is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/checkout/sessions')
        .set('Authorization', 'Bearer sk_test_dummy')
        .send({ amount: 25 });

      expect(res.status).toBe(400);
    });
  });

  // ── Get session status ──────────────────────────────────────────────────────

  describe('GET /v1/checkout/sessions/:id — get session status', () => {
    it('returns 200 with public session fields', async () => {
      const res = await request(app.getHttpServer()).get(`/v1/checkout/sessions/${stubSession.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: stubSession.id, status: 'pending' });
      expect(res.body).not.toHaveProperty('memo');
      expect(res.body).not.toHaveProperty('receivingAccount');
    });

    it('returns 404 when session does not exist', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockCheckoutService.getSession.mockRejectedValue(new NotFoundException('Session not found'));

      const res = await request(app.getHttpServer()).get('/v1/checkout/sessions/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  // ── Cancel session ──────────────────────────────────────────────────────────

  describe('POST /v1/checkout/sessions/:id/cancel — cancel session', () => {
    it('returns 201 and delegates to cancelSession', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/checkout/sessions/${stubSession.id}/cancel`)
        .set('Authorization', 'Bearer sk_test_dummy');

      expect(res.status).toBe(201);
      expect(mockCheckoutService.cancelSession).toHaveBeenCalledWith(stubSession.id, MERCHANT_ID);
    });

    it('returns 400 when session is not cancellable', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      mockCheckoutService.cancelSession.mockRejectedValue(
        new BadRequestException('Session is not pending'),
      );

      const res = await request(app.getHttpServer())
        .post(`/v1/checkout/sessions/${stubSession.id}/cancel`)
        .set('Authorization', 'Bearer sk_test_dummy');

      expect(res.status).toBe(400);
    });
  });
});
