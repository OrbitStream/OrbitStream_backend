import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { db } from '../db/index';
import { merchants } from '../db/schema';
import { eq } from 'drizzle-orm';

const CORS_CACHE_KEY = 'orbitstream:cors_origins';
const CACHE_TTL_MS = 5 * 60 * 1000;
const ALL_MERCHANT_ORIGINS_KEY = 'orbitstream:cors_origins:all';

@Injectable()
export class CorsOriginsCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CorsOriginsCacheService.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    await this.refreshCache();
    this.intervalId = setInterval(() => this.refreshCache(), CACHE_TTL_MS);
    this.logger.log('CORS origins cache scheduled every 5 minutes');
  }

  onModuleDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async refreshCache(): Promise<void> {
    try {
      const allMerchants = await db.query.merchants.findMany({
        columns: { id: true, corsOrigins: true },
      });

      const pipe = this.redis.getClient().pipeline();

      for (const m of allMerchants) {
        const origins: string[] = (m.corsOrigins as string[]) ?? [];
        pipe.set(`${CORS_CACHE_KEY}:${m.id}`, JSON.stringify(origins), 'PX', CACHE_TTL_MS);
      }

      const allOrigins = new Set<string>();
      for (const m of allMerchants) {
        const origins: string[] = (m.corsOrigins as string[]) ?? [];
        for (const o of origins) allOrigins.add(o);
      }
      pipe.set(ALL_MERCHANT_ORIGINS_KEY, JSON.stringify([...allOrigins]), 'PX', CACHE_TTL_MS);

      await pipe.exec();
    } catch (err) {
      this.logger.error('Failed to refresh CORS origins cache', err);
    }
  }

  async getMerchantOrigins(merchantId: string): Promise<string[]> {
    try {
      const raw = await this.redis.getClient().get(`${CORS_CACHE_KEY}:${merchantId}`);
      if (raw) return JSON.parse(raw) as string[];
    } catch {}

    const merchant = await db.query.merchants.findFirst({
      where: eq(merchants.id, merchantId),
      columns: { corsOrigins: true },
    });
    const origins: string[] = (merchant?.corsOrigins as string[]) ?? [];
    await this.redis
      .getClient()
      .set(`${CORS_CACHE_KEY}:${merchantId}`, JSON.stringify(origins), 'PX', CACHE_TTL_MS);
    return origins;
  }

  async getAllMerchantOrigins(): Promise<string[]> {
    try {
      const raw = await this.redis.getClient().get(ALL_MERCHANT_ORIGINS_KEY);
      if (raw) return JSON.parse(raw) as string[];
    } catch {}

    const allMerchants = await db.query.merchants.findMany({
      columns: { corsOrigins: true },
    });
    const origins = new Set<string>();
    for (const m of allMerchants) {
      const o: string[] = (m.corsOrigins as string[]) ?? [];
      for (const origin of o) origins.add(origin);
    }
    const result = [...origins];
    await this.redis
      .getClient()
      .set(ALL_MERCHANT_ORIGINS_KEY, JSON.stringify(result), 'PX', CACHE_TTL_MS);
    return result;
  }

  async invalidateMerchantCache(merchantId: string): Promise<void> {
    await this.redis.getClient().del(`${CORS_CACHE_KEY}:${merchantId}`);
    await this.refreshCache();
  }

  invalidateAllCache(): void {
    this.refreshCache();
  }
}
