import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
    process.env.FRONTEND_URL = 'https://checkout.example.com';
    process.env.PLATFORM_RECEIVING_ACCOUNT =
      'GTESTACCOUNT123456789012345678901234567890123456789012345';

    const module: TestingModule = await Test.createTestingModule({
      providers: [CheckoutService, { provide: AuditService, useValue: mockAuditService }],
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
        url: 'https://checkout.example.com/checkout/sess-1',
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
