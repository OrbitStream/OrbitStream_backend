import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { CorsOriginsCacheService } from '../middleware/cors-origins-cache.service';
import { AuditService } from '../audit/audit.service';

jest.mock('../db/index', () => ({
  db: {
    query: {
      merchants: { findFirst: jest.fn() },
      apiKeys: { findFirst: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

import { db } from '../db/index';

describe('MerchantsService', () => {
  let service: MerchantsService;
  let auditService: AuditService;

  const mockCorsCache = { invalidateMerchantCache: jest.fn() };
  const mockAuditService = {
    log: jest.fn(),
    logAuthFailure: jest.fn(),
    logAccessDenied: jest.fn(),
    logSensitiveOperation: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantsService,
        { provide: CorsOriginsCacheService, useValue: mockCorsCache },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<MerchantsService>(MerchantsService);
    auditService = module.get<AuditService>(AuditService);
  });

  describe('register', () => {
    it('should log merchant registration', async () => {
      (db.query.merchants.findFirst as jest.Mock).mockResolvedValue(undefined);
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 'm-1', walletAddress: 'GABC' }]),
        }),
      });

      await service.register('GABC', 'Test Business', 'test@example.com');

      expect(mockAuditService.logSensitiveOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'm-1',
          action: 'merchant_registered',
          resourceType: 'merchant',
        }),
      );
    });

    it('should throw ConflictException for duplicate wallet', async () => {
      (db.query.merchants.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' });
      await expect(service.register('GABC', 'Test', 'a@b.com')).rejects.toThrow(ConflictException);
    });
  });

  describe('generateApiKey', () => {
    it('should log API key generation', async () => {
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 'key-1', merchantId: 'm-1' }]),
        }),
      });

      await service.generateApiKey('m-1', 'testnet');

      expect(mockAuditService.logSensitiveOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'm-1',
          action: 'api_key_generated',
          resourceType: 'api_key',
        }),
      );
    });
  });

  describe('revokeApiKey', () => {
    it('should log API key revocation', async () => {
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 'key-1', merchantId: 'm-1' }]),
          }),
        }),
      });

      await service.revokeApiKey('m-1', 'key-1');

      expect(mockAuditService.logSensitiveOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'm-1',
          action: 'api_key_revoked',
          resourceType: 'api_key',
        }),
      );
    });

    it('should throw NotFoundException for invalid key', async () => {
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(service.revokeApiKey('m-1', 'key-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setWebhook', () => {
    it('should log webhook update', async () => {
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ webhookUrl: 'https://hook.example.com', webhookSecret: 'secret' }]),
          }),
        }),
      });

      await service.setWebhook('m-1', 'https://hook.example.com');

      expect(mockAuditService.logSensitiveOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'm-1',
          action: 'webhook_updated',
          resourceType: 'merchant',
        }),
      );
    });
  });
});
