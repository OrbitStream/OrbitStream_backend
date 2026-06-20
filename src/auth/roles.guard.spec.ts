import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AuditService } from '../audit/audit.service';

jest.mock('../db/index', () => ({
  db: {
    query: {
      merchants: { findFirst: jest.fn() },
    },
  },
}));

import { db } from '../db/index';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let auditService: AuditService;

  const mockContext = (merchantId?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          params: {},
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
    guard = new RolesGuard(reflector, auditService);
    jest.clearAllMocks();
  });

  it('should allow access when no @Roles decorator is set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const result = await guard.canActivate(mockContext('merchant-1'));
    expect(result).toBe(true);
  });

  it('should allow admin access to any endpoint', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['merchant']);
    (db.query.merchants.findFirst as jest.Mock).mockResolvedValue({ role: 'admin' });

    const result = await guard.canActivate(mockContext('merchant-1'));
    expect(result).toBe(true);
  });

  it('should allow merchant access to merchant-only endpoints', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['merchant']);
    (db.query.merchants.findFirst as jest.Mock).mockResolvedValue({ role: 'merchant' });

    const result = await guard.canActivate(mockContext('merchant-1'));
    expect(result).toBe(true);
  });

  it('should deny viewer access to write endpoints', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin', 'merchant']);
    (db.query.merchants.findFirst as jest.Mock).mockResolvedValue({ role: 'viewer' });

    await expect(guard.canActivate(mockContext('merchant-1'))).rejects.toThrow(ForbiddenException);
    expect(auditService.logAuthFailure).toHaveBeenCalled();
  });

  it('should allow viewer access to read-only endpoints (no @Roles)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const result = await guard.canActivate(mockContext('merchant-1'));
    expect(result).toBe(true);
  });

  it('should deny when merchant not found', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    (db.query.merchants.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(guard.canActivate(mockContext('merchant-1'))).rejects.toThrow(ForbiddenException);
  });
});
