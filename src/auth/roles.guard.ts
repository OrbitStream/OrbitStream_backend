import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { db } from '../db/index';
import { merchants } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';

export type MerchantRole = 'admin' | 'merchant' | 'viewer';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: MerchantRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<MerchantRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const merchantId = request.merchantId;

    if (!merchantId) {
      throw new ForbiddenException('No merchant context');
    }

    const merchant = await db.query.merchants.findFirst({
      where: eq(merchants.id, merchantId),
      columns: { role: true },
    });

    if (!merchant) {
      throw new ForbiddenException('Merchant not found');
    }

    const merchantRole = merchant.role as MerchantRole;

    if (merchantRole === 'admin') {
      return true;
    }

    if (!requiredRoles.includes(merchantRole)) {
      await this.auditService.logAuthFailure({
        merchantId,
        action: 'insufficient_role',
        resourceType: 'endpoint',
        resourceId: request.params?.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        reason: `Role '${merchantRole}' not in [${requiredRoles.join(', ')}]`,
      });
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredRoles.join(' or ')}`,
      );
    }

    return true;
  }
}
