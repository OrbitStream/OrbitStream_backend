import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { db } from '../db/index';
import { merchants, apiKeys } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import { CorsOriginsCacheService } from '../middleware/cors-origins-cache.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class MerchantsService {
  constructor(
    private readonly corsCache: CorsOriginsCacheService,
    private readonly auditService: AuditService,
  ) {}

  async register(walletAddress: string, businessName: string, email: string) {
    const existing = await db.query.merchants.findFirst({
      where: eq(merchants.walletAddress, walletAddress),
    });
    if (existing) throw new ConflictException('Merchant already registered');

    const [merchant] = await db
      .insert(merchants)
      .values({ walletAddress, businessName, email })
      .returning();

    await this.auditService.logSensitiveOperation({
      merchantId: merchant.id,
      action: 'merchant_registered',
      resourceType: 'merchant',
      resourceId: merchant.id,
    });

    return merchant;
  }

  async findByWallet(walletAddress: string) {
    return db.query.merchants.findFirst({
      where: eq(merchants.walletAddress, walletAddress),
    });
  }

  async findById(id: string) {
    const merchant = await db.query.merchants.findFirst({
      where: eq(merchants.id, id),
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return merchant;
  }

  async update(id: string, data: { businessName?: string; email?: string; logoUrl?: string }) {
    const [updated] = await db.update(merchants).set(data).where(eq(merchants.id, id)).returning();
    return updated;
  }

  async generateApiKey(merchantId: string, environment: 'testnet' | 'mainnet') {
    const prefix = environment === 'testnet' ? 'sk_test_' : 'sk_live_';
    const rawKey = prefix + crypto.randomBytes(24).toString('hex');
    const keyPrefix = rawKey.slice(0, 12) + '...';
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const [apiKey] = await db
      .insert(apiKeys)
      .values({
        merchantId,
        keyPrefix,
        keyHash,
        environment,
      } as any)
      .returning();

    await this.auditService.logSensitiveOperation({
      merchantId,
      action: 'api_key_generated',
      resourceType: 'api_key',
      resourceId: apiKey.id,
    });

    return { key: rawKey, keyPrefix };
  }

  async listApiKeys(merchantId: string) {
    return db.query.apiKeys.findMany({
      where: eq(apiKeys.merchantId, merchantId),
      columns: { id: true, keyPrefix: true, environment: true, isActive: true, createdAt: true },
    });
  }

  async revokeApiKey(merchantId: string, keyId: string) {
    const [key] = await db
      .update(apiKeys)
      .set({ isActive: false } as any)
      .where(eq(apiKeys.id, keyId))
      .returning();
    if (!key || key.merchantId !== merchantId) {
      throw new NotFoundException('API key not found');
    }

    await this.auditService.logSensitiveOperation({
      merchantId,
      action: 'api_key_revoked',
      resourceType: 'api_key',
      resourceId: keyId,
    });

    return { revoked: true };
  }

  async setWebhook(merchantId: string, webhookUrl: string) {
    const webhookSecret = crypto.randomBytes(32).toString('hex');
    const [updated] = await db
      .update(merchants)
      .set({ webhookUrl, webhookSecret } as any)
      .where(eq(merchants.id, merchantId))
      .returning();

    await this.auditService.logSensitiveOperation({
      merchantId,
      action: 'webhook_updated',
      resourceType: 'merchant',
      resourceId: merchantId,
    });

    return { webhookUrl: updated.webhookUrl, webhookSecret };
  }

  async validateApiKey(rawKey: string): Promise<string | null> {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const key = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyHash, keyHash),
    });
    if (!key || !key.isActive) return null;
    return key.merchantId;
  }

  async getCorsOrigins(merchantId: string): Promise<string[]> {
    const merchant = await this.findById(merchantId);
    return (merchant.corsOrigins ?? []) as string[];
  }

  async setCorsOrigins(merchantId: string, origins: string[]): Promise<string[]> {
    const [updated] = await db
      .update(merchants)
      .set({ corsOrigins: origins } as any)
      .where(eq(merchants.id, merchantId))
      .returning();
    if (!updated) throw new NotFoundException('Merchant not found');
    await this.corsCache.invalidateMerchantCache(merchantId);
    return (updated.corsOrigins ?? []) as string[];
  }

  async deleteCorsOrigin(merchantId: string, origin: string): Promise<boolean> {
    const current = await this.getCorsOrigins(merchantId);
    const filtered = current.filter((o: string) => o !== origin);
    if (filtered.length === current.length) return false;
    await this.setCorsOrigins(merchantId, filtered);
    return true;
  }
}
