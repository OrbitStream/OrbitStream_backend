import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ResourceOwnershipGuard } from './resource-ownership.guard';
import { AuditService } from '../audit/audit.service';

jest.mock('../db/index', () => ({
  db: {
    query: {
      apiKeys: { findFirst: jest.fn() },
      checkoutSessions: { findFirst: jest.fn() },
      merchants: { findFirst: jest.fn() },
    },
  },
}));

import { db } from '../db/index';

describe('ResourceOwnershipGuard', () => {
  let guard: ResourceOwnershipGuard;
  let reflector: Reflector;
  let auditService: AuditService;

  const mockContext = (params: Record<string, string>, merchantId?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          params,
          merchantId,
          ip: '127.0.0.1',
          headers: { 'user-agent': 'test' },
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    auditService = {
      log: jest.fn(),
      logAuthFailure: jest.fn(),
      logAccessDenied: jest.fn(),
      logSensitiveOperation: jest.fn(),
    } as any;
    guard = new ResourceOwnershipGuard(reflector, auditService);
    jest.clearAllMocks();
  });

  it('should allow access when no @ResourceOwner decorator is set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const result = await guard.canActivate(mockContext({ id: 'res-1' }, 'merchant-1'));
    expect(result).toBe(true);
  });

  it('should allow access when resource belongs to merchant', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('api_key');
    (db.query.apiKeys.findFirst as jest.Mock).mockResolvedValue({ merchantId: 'merchant-1' });

    const result = await guard.canActivate(mockContext({ id: 'key-1' }, 'merchant-1'));
    expect(result).toBe(true);
  });

  it('should deny access when resource belongs to another merchant', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('api_key');
    (db.query.apiKeys.findFirst as jest.Mock).mockResolvedValue({ merchantId: 'merchant-2' });

    await expect(guard.canActivate(mockContext({ id: 'key-1' }, 'merchant-1'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(auditService.logAccessDenied).toHaveBeenCalled();
  });

  it('should deny access when resource is not found', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('api_key');
    (db.query.apiKeys.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(guard.canActivate(mockContext({ id: 'key-1' }, 'merchant-1'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(auditService.logAuthFailure).toHaveBeenCalled();
  });

  it('should deny when no merchant context', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('api_key');
    await expect(guard.canActivate(mockContext({ id: 'key-1' }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should check checkout_session ownership', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('checkout_session');
    (db.query.checkoutSessions.findFirst as jest.Mock).mockResolvedValue({
      merchantId: 'merchant-1',
    });

    const result = await guard.canActivate(mockContext({ id: 'sess-1' }, 'merchant-1'));
    expect(result).toBe(true);
  });
});
