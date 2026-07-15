import { AuditService } from './audit.service';

jest.mock('../db/index', () => ({
  db: {
    insert: jest.fn(),
  },
}));

import { db } from '../db/index';

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuditService();
  });

  describe('log', () => {
    it('should insert audit log entry', async () => {
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      });

      await service.log({
        merchantId: 'm-1',
        action: 'test_action',
        resourceType: 'test_resource',
        resourceId: 'r-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        details: { key: 'value' },
      });

      expect(db.insert).toHaveBeenCalled();
    });

    it('should not throw on database errors but log a warning', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const dbError = new Error('DB error');

      (db.insert as jest.Mock).mockImplementation(() => ({
        values: jest.fn().mockRejectedValue(dbError),
      }));

      await expect(
        service.log({
          action: 'test',
          resourceType: 'test',
        }),
      ).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith('[AuditService] Failed to write audit log:', dbError);
      warnSpy.mockRestore();
    });
  });

  describe('logAuthFailure', () => {
    it('should log auth failure with reason', async () => {
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      });

      await service.logAuthFailure({
        merchantId: 'm-1',
        action: 'access_denied',
        resourceType: 'api_key',
        resourceId: 'key-1',
        reason: 'Invalid credentials',
      });

      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('logAccessDenied', () => {
    it('should log access denied', async () => {
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      });

      await service.logAccessDenied({
        merchantId: 'm-1',
        resourceType: 'checkout_session',
        resourceId: 'sess-1',
      });

      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('logSensitiveOperation', () => {
    it('should log sensitive operation', async () => {
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      });

      await service.logSensitiveOperation({
        merchantId: 'm-1',
        action: 'api_key_generated',
        resourceType: 'api_key',
        resourceId: 'key-1',
      });

      expect(db.insert).toHaveBeenCalled();
    });
  });
});
