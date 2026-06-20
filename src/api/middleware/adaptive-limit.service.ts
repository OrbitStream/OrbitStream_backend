import { Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RedisService } from '../../redis/redis.service';

/** A merchant must clear *more than* this many payments in an hour to earn the bonus. */
export const ADAPTIVE_PAYMENT_THRESHOLD = 10;
/** The bonus multiplier applied to the checkout-creation limit once earned. */
export const ADAPTIVE_BONUS_MULTIPLIER = 1.5;

const ONE_HOUR_MS = 60 * 60 * 1000;
/** Keep two hourly buckets alive so a counter never vanishes mid-window. */
const COUNTER_TTL_SECONDS = 2 * 60 * 60;

/**
 * Adaptive rate limits for high-volume merchants.
 *
 * Each successful payment bumps a per-merchant, per-hour Redis counter
 * (`orbitstream:merchant_payments:{id}:{hour}`). Once a merchant clears more
 * than {@link ADAPTIVE_PAYMENT_THRESHOLD} payments in the current hour, their
 * checkout-creation limit is raised by 50% ({@link ADAPTIVE_BONUS_MULTIPLIER}).
 *
 * Every operation fails open: if Redis is unavailable the merchant simply keeps
 * the base limit rather than the request erroring.
 */
@Injectable()
export class AdaptiveLimitService {
  private readonly logger = new Logger(AdaptiveLimitService.name);

  constructor(private readonly redisService: RedisService) {}

  /** The epoch-hour bucket a timestamp falls into. */
  static hourBucket(now = Date.now()): number {
    return Math.floor(now / ONE_HOUR_MS);
  }

  /** Redis key for a merchant's successful-payment counter in a given hour. */
  static counterKey(merchantId: string, hourBucket = AdaptiveLimitService.hourBucket()): string {
    return `orbitstream:merchant_payments:${merchantId}:${hourBucket}`;
  }

  /**
   * Record one successful payment for a merchant. Called by the payment detector
   * after a payment is confirmed and committed.
   */
  async recordPayment(merchantId: string): Promise<void> {
    const client = this.readyClient();
    if (!client) return;
    const key = AdaptiveLimitService.counterKey(merchantId);
    try {
      await client.multi().incr(key).expire(key, COUNTER_TTL_SECONDS).exec();
    } catch (err) {
      this.logger.warn(`Failed to record payment for adaptive limits: ${message(err)}`);
    }
  }

  /**
   * The checkout-creation limit multiplier for a merchant: {@link
   * ADAPTIVE_BONUS_MULTIPLIER} once they exceed the hourly payment threshold,
   * otherwise `1`.
   */
  async getCheckoutBonus(merchantId: string): Promise<number> {
    const client = this.readyClient();
    if (!client) return 1;
    try {
      const raw = await client.get(AdaptiveLimitService.counterKey(merchantId));
      const count = raw ? parseInt(raw, 10) : 0;
      return count > ADAPTIVE_PAYMENT_THRESHOLD ? ADAPTIVE_BONUS_MULTIPLIER : 1;
    } catch (err) {
      this.logger.warn(`Failed to read adaptive payment counter: ${message(err)}`);
      return 1;
    }
  }

  private readyClient(): Redis | null {
    const client = this.redisService.getClient();
    if (!client) return null;
    if (client.status && client.status !== 'ready') return null;
    return client;
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
