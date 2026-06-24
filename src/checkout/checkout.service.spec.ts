import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CheckoutService } from './checkout.service';
import { AuditService } from '../audit/audit.service';

jest.mock('../db/index', () => ({
  db: {
    query: {
      checkoutSessions: { findFirst: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

import { db } from '../db/index';

const FRONTEND_URL = 'https://checkout.example.com';
const RECEIVING_ACCOUNT = 'GTESTACCOUNT123456789012345678901234567890123456789012345';

const mockConfigGet = jest.fn();
const mockConfigService = { get: mockConfigGet };

describe('CheckoutService', () => {
  let service: CheckoutService;

  const mockAuditService = {
    log: jest.fn(),
    logAuthFailure: jest.fn(),
    logAccessDenied: jest.fn(),
    logSensitiveOperation: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigGet.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        FRONTEND_URL,
        PLATFORM_RECEIVING_ACCOUNT: RECEIVING_ACCOUNT,
        CHECKOUT_SESSION_TTL_MINUTES: 30,
      };
      return values[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: AuditService, useValue: mockAuditService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
  });

  describe('toPublicSession', () => {
    it('should strip sensitive fields from session', () => {
      const session = {
        id: 'sess-1',
        merchantId: 'merchant-1',
        amount: '10.0000000',
        assetCode: 'USDC',
        assetIssuer: 'ISSUER123',
        receivingAccount: 'GSECRET',
        memo: 'secret-memo',
        status: 'pending',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        metadata: { orderId: '123' },
        expiresAt: new Date(),
        createdAt: new Date(),
      };

      const result = service.toPublicSession(session);

      expect(result).toEqual({
        id: 'sess-1',
        url: `${FRONTEND_URL}/checkout/sess-1`,
        amount: '10.0000000',
        asset: 'USDC',
        status: 'pending',
        expiresAt: session.expiresAt,
      });

      expect(result).not.toHaveProperty('merchantId');
      expect(result).not.toHaveProperty('receivingAccount');
      expect(result).not.toHaveProperty('memo');
      expect(result).not.toHaveProperty('metadata');
      expect(result).not.toHaveProperty('successUrl');
      expect(result).not.toHaveProperty('cancelUrl');
      expect(result).not.toHaveProperty('assetIssuer');
    });
  });

  describe('getSession', () => {
    it('should return public session fields only', async () => {
      (db.query.checkoutSessions.findFirst as jest.Mock).mockResolvedValue({
        id: 'sess-1',
        merchantId: 'merchant-1',
        amount: '10.0000000',
        assetCode: 'USDC',
        receivingAccount: 'GSECRET',
        memo: 'secret',
        status: 'pending',
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
      });

      const result = await service.getSession('sess-1');

      expect(result).not.toHaveProperty('merchantId');
      expect(result).not.toHaveProperty('receivingAccount');
      expect(result).not.toHaveProperty('memo');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('url');
    });

    it('should throw NotFoundException for missing session', async () => {
      (db.query.checkoutSessions.findFirst as jest.Mock).mockResolvedValue(undefined);
      await expect(service.getSession('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });


  describe('createSession', () => {
    const mockSession = {
      id: 'sess-new',
      merchantId: 'merchant-1',
      amount: '25.0000000',
      assetCode: 'USDC',
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };

    it('should create a session and return a URL + public fields', async () => {
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockSession]),
        }),
      });

      const result = await service.createSession('merchant-1', {
        amount: 25,
        asset: 'USDC',
        successUrl: 'https://example.com/success',
      });

      expect(result.id).toBe('sess-new');
      expect(result.url).toContain('/checkout/sess-new');
      expect(result.status).toBe('pending');
      expect(result).not.toHaveProperty('memo');
      expect(result).not.toHaveProperty('receivingAccount');
      expect(db.insert).toHaveBeenCalled();
    });

    it('should throw BadRequestException when PLATFORM_RECEIVING_ACCOUNT is not set', async () => {
      mockConfigGet.mockImplementation((key: string) => {
        if (key === 'PLATFORM_RECEIVING_ACCOUNT') return undefined;
        const values: Record<string, unknown> = {
          FRONTEND_URL,
          CHECKOUT_SESSION_TTL_MINUTES: 30,
        };
        return values[key];
      });

      await expect(
        service.createSession('merchant-1', { amount: 10, asset: 'USDC' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSession — auto-expire', () => {
    it('should mark the session expired and return status "expired"', async () => {
      (db.query.checkoutSessions.findFirst as jest.Mock).mockResolvedValue({
        id: 'sess-expired',
        merchantId: 'merchant-1',
        amount: '10.0000000',
        assetCode: 'USDC',
        receivingAccount: 'GSECRET',
        memo: 'secret',
        status: 'pending',
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      });
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      const result = await service.getSession('sess-expired');

      expect(result.status).toBe('expired');
      expect(db.update).toHaveBeenCalled();
    });
  });


  describe('cancelSession', () => {
    it('should log sensitive operation on cancel', async () => {
      (db.query.checkoutSessions.findFirst as jest.Mock).mockResolvedValue({
        id: 'sess-1',
        merchantId: 'merchant-1',
        status: 'pending',
      });
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 'sess-1', status: 'cancelled' }]),
          }),
        }),
      });

      await service.cancelSession('sess-1', 'merchant-1');

      expect(mockAuditService.logSensitiveOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'merchant-1',
          action: 'session_cancelled',
          resourceType: 'checkout_session',
        }),
      );
    });
  });
});
