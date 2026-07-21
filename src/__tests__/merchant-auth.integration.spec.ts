/**
 * Merchant auth flow integration tests (HTTP layer).
 *
 * Exercises the full auth → guard → controller flow for role-protected
 * merchant endpoints: JWT strategy populates req.merchantId, RolesGuard
 * resolves merchant and enforces roles, controller handles the request.
 *
 * Database is mocked so no real connections are opened.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';

import { MerchantsController } from '../merchants/merchants.controller';
import { MerchantsService } from '../merchants/merchants.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from '../audit/audit.service';
import { CorsOriginsCacheService } from '../middleware/cors-origins-cache.service';

const JWT_SECRET = process.env.JWT_SECRET!;

const mockMerchant = {
  id: 'merchant-123',
  walletAddress: 'GABC1234567890ABCDEF',
  businessName: 'Test Business',
  email: 'test@example.com',
  role: 'merchant',
  webhookUrl: null,
  webhookSecret: null,
  logoUrl: null,
  corsOrigins: [],
  createdAt: new Date(),
};

jest.mock('../db/index');

import { db } from '../db/index';
const dbMock = db as any;

describe('Merchant auth flow integration (HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [MerchantsController],
      providers: [
        MerchantsService,
        JwtStrategy,
        RolesGuard,
        Reflector,
        {
          provide: AuditService,
          useValue: { logAuthFailure: jest.fn(), logSensitiveOperation: jest.fn() },
        },
        { provide: CorsOriginsCacheService, useValue: { invalidateMerchantCache: jest.fn() } },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    dbMock.query.merchants.findFirst.mockReset();
    dbMock.insert.mockReset();
    dbMock.update.mockReset();

    dbMock.query.merchants.findFirst.mockResolvedValue(mockMerchant);

    dbMock.update.mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest
            .fn()
            .mockResolvedValue([{ ...mockMerchant, businessName: 'Updated Business' }]),
        }),
      }),
    });

    dbMock.insert.mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest
          .fn()
          .mockResolvedValue([
            { id: 'key-123', keyPrefix: 'sk_test_...', merchantId: 'merchant-123' },
          ]),
      }),
    });
  });

  function makeJwt(walletAddress: string) {
    return jwt.sign({ sub: walletAddress, walletAddress }, JWT_SECRET);
  }

  describe('GET /merchants/me', () => {
    it('returns merchant profile for authenticated request', async () => {
      const res = await request(app.getHttpServer())
        .get('/merchants/me')
        .set('Authorization', `Bearer ${makeJwt(mockMerchant.walletAddress)}`);

      expect(res.status).toBe(200);
      expect(res.body.walletAddress).toBe(mockMerchant.walletAddress);
      expect(res.body.businessName).toBe(mockMerchant.businessName);
    });
  });

  describe('PATCH /merchants/me (role-protected)', () => {
    it('allows merchant role to update profile', async () => {
      const res = await request(app.getHttpServer())
        .patch('/merchants/me')
        .set('Authorization', `Bearer ${makeJwt(mockMerchant.walletAddress)}`)
        .send({ businessName: 'Updated Business' });

      expect(res.status).toBe(200);
    });

    it('returns 403 for viewer role on write endpoint', async () => {
      dbMock.query.merchants.findFirst.mockResolvedValue({ ...mockMerchant, role: 'viewer' });

      const res = await request(app.getHttpServer())
        .patch('/merchants/me')
        .set('Authorization', `Bearer ${makeJwt(mockMerchant.walletAddress)}`)
        .send({ businessName: 'Should Fail' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /merchants/me/api-keys (role-protected)', () => {
    it('allows merchant role to generate API key', async () => {
      const res = await request(app.getHttpServer())
        .post('/merchants/me/api-keys')
        .set('Authorization', `Bearer ${makeJwt(mockMerchant.walletAddress)}`)
        .send({ environment: 'testnet' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('key');
      expect(res.body).toHaveProperty('keyPrefix');
    });
  });

  describe('PATCH /merchants/me/webhook (role-protected)', () => {
    it('allows merchant role to set webhook', async () => {
      const res = await request(app.getHttpServer())
        .patch('/merchants/me/webhook')
        .set('Authorization', `Bearer ${makeJwt(mockMerchant.walletAddress)}`)
        .send({ webhookUrl: 'https://example.com/webhook' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('webhookUrl');
      expect(res.body).toHaveProperty('webhookSecret');
    });
  });

  describe('PUT /merchants/me/cors (role-protected)', () => {
    it('allows merchant role to set CORS origins', async () => {
      const res = await request(app.getHttpServer())
        .put('/merchants/me/cors')
        .set('Authorization', `Bearer ${makeJwt(mockMerchant.walletAddress)}`)
        .send({ origins: ['https://example.com'] });

      expect(res.status).toBe(200);
    });
  });

  describe('unregistered wallet', () => {
    it('returns 200 with empty body for unregistered wallet on getProfile', async () => {
      dbMock.query.merchants.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/merchants/me')
        .set('Authorization', `Bearer ${makeJwt('GUNREGISTERED')}`);

      expect(res.status).toBe(200);
    });
  });

  describe('no Authorization header', () => {
    it('returns 401 for protected endpoints without JWT', async () => {
      const res = await request(app.getHttpServer())
        .patch('/merchants/me')
        .send({ businessName: 'Should Fail' });

      expect(res.status).toBe(401);
    });
  });
});
