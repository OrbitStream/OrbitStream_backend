import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { db } from '../db/index';
import { apiKeys, checkoutSessions, merchants } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';

export const RESOURCE_OWNER_KEY = 'resource_owner';
export const ResourceOwner = (resourceType: string) =>
  SetMetadata(RESOURCE_OWNER_KEY, resourceType);

type ResourceType = 'api_key' | 'checkout_session' | 'merchant';

async function resolveOwnerId(
  resourceType: ResourceType,
  resourceId: string,
): Promise<string | null> {
  switch (resourceType) {
    case 'api_key': {
      const key = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.id, resourceId),
        columns: { merchantId: true },
      });
      return key?.merchantId ?? null;
    }
    case 'checkout_session': {
      const session = await db.query.checkoutSessions.findFirst({
        where: eq(checkoutSessions.id, resourceId),
        columns: { merchantId: true },
      });
      return session?.merchantId ?? null;
    }
    case 'merchant': {
      const merchant = await db.query.merchants.findFirst({
        where: eq(merchants.id, resourceId),
        columns: { id: true },
      });
      return merchant?.id ?? null;
    }
    default:
      return null;
  }
}

@Injectable()
export class ResourceOwnershipGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resourceType = this.reflector.getAllAndOverride<ResourceType>(RESOURCE_OWNER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!resourceType) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const merchantId = request.merchantId;

    if (!merchantId) {
      throw new ForbiddenException('No merchant context');
    }

    const resourceId = request.params.id;
    if (!resourceId) {
      throw new ForbiddenException('No resource ID provided');
    }

    const ownerId = await resolveOwnerId(resourceType, resourceId);

    if (!ownerId) {
      await this.auditService.logAuthFailure({
        merchantId,
        action: 'resource_not_found',
        resourceType,
        resourceId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        reason: 'Resource does not exist',
      });
      throw new ForbiddenException('Resource not found');
    }

    if (ownerId !== merchantId) {
      await this.auditService.logAccessDenied({
        merchantId,
        resourceType,
        resourceId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
      throw new ForbiddenException('You do not own this resource');
    }

    return true;
  }
}
