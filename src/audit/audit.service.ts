import { Injectable } from '@nestjs/common';
import { db } from '../db/index';
import { auditLogs } from '../db/schema';

export interface AuditLogEntry {
  merchantId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        merchantId: entry.merchantId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        details: entry.details ?? null,
      } as any);
    } catch {
      // Audit logging should never fail the request
    }
  }

  async logAuthFailure(params: {
    merchantId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
    reason: string;
  }): Promise<void> {
    await this.log({
      ...params,
      details: { reason: params.reason },
    });
  }

  async logAccessDenied(params: {
    merchantId: string;
    resourceType: string;
    resourceId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.log({
      ...params,
      action: 'access_denied',
      details: { reason: 'ownership_mismatch' },
    });
  }

  async logSensitiveOperation(params: {
    merchantId: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.log(params);
  }
}
