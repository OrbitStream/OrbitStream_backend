import { Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RedisService } from '../../redis/redis.service';
import { WINDOW_MS } from './rate-limit.config';

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** The effective limit applied (may be reduced under degraded mode). */
  limit: number;
  /** Remaining requests in the current window (never negative). */
  remaining: number;
  /** Unix epoch seconds when the window resets / the oldest entry expires. */
  resetSeconds: number;
  /** Seconds the client should wait before retrying (only set when blocked). */
  retryAfterSeconds: number;
  /** True when the Redis backend was unavailable and the in-memory fallback ran. */
  degraded: boolean;
}

/**
 * Atomic sliding-window rate limiter (Redis sorted sets).
 *
 * The Lua script runs the whole check-and-increment in one round trip so
 * concurrent requests cannot race past the limit:
 *   1. Drop entries older than the window (ZREMRANGEBYSCORE).
 *   2. Count remaining entries (ZCARD).
 *   3. If under the limit, add the current request (ZADD) and refresh the TTL.
 *   4. Return [allowed, count, oldestScore].
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

local allowed = 0
if count < limit then
  redis.call('ZADD', key, now, member)
  count = count + 1
  allowed = 1
end

redis.call('PEXPIRE', key, window)

local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local oldestScore = now
if oldest[2] then
  oldestScore = tonumber(oldest[2])
end

return { allowed, count, oldestScore }
`;

interface MemoryEntry {
  timestamps: number[];
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly memoryStore = new Map<string, MemoryEntry>();
  /** Throttle the "Redis unavailable" warning so we don't flood the logs. */
  private lastDegradedWarn = 0;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check (and, if allowed, record) a request against its limit.
   *
   * `keyspace` is the full identity (rule name + scope identity) used as the
   * Redis/memory key. `limit` is the normal limit; `degradedLimit` (defaults to
   * 50% of `limit`) is applied automatically when the Redis backend is
   * unavailable and the in-memory fallback runs. Passing both up front means the
   * request is recorded exactly once, with the correct limit, in a single pass.
   */
  async check(keyspace: string, limit: number, degradedLimit?: number): Promise<RateLimitResult> {
    const now = Date.now();
    const fallbackLimit = degradedLimit ?? Math.max(1, Math.floor(limit / 2));
    try {
      const client = this.getReadyClient();
      if (!client) {
        return this.checkMemory(keyspace, fallbackLimit, now);
      }
      return await this.checkRedis(client, keyspace, limit, now);
    } catch (err) {
      this.warnDegraded(err);
      return this.checkMemory(keyspace, fallbackLimit, now);
    }
  }

  private getReadyClient(): Redis | null {
    const client = this.redisService.getClient();
    if (!client) return null;
    // ioredis exposes `status`; only use it when actually connected.
    if (client.status && client.status !== 'ready') {
      return null;
    }
    return client;
  }

  private async checkRedis(
    client: Redis,
    keyspace: string,
    limit: number,
    now: number,
  ): Promise<RateLimitResult> {
    const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;
    const raw = (await client.eval(
      SLIDING_WINDOW_LUA,
      1,
      `ratelimit:${keyspace}`,
      String(now),
      String(WINDOW_MS),
      String(limit),
      member,
    )) as [number, number, number];

    const allowed = raw[0] === 1;
    const count = raw[1];
    const oldestScore = raw[2];

    return this.buildResult({
      allowed,
      count,
      limit,
      oldestScore,
      now,
      degraded: false,
    });
  }

  /**
   * In-memory sliding window. Used when Redis is unavailable; the limit is halved
   * by the caller (degraded mode) to stay conservative across multiple instances.
   */
  private checkMemory(keyspace: string, limit: number, now: number): RateLimitResult {
    const windowStart = now - WINDOW_MS;
    const entry = this.memoryStore.get(keyspace) ?? { timestamps: [] };
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    const count = entry.timestamps.length;
    let allowed = false;
    if (count < limit) {
      entry.timestamps.push(now);
      allowed = true;
    }
    this.memoryStore.set(keyspace, entry);

    const oldestScore = entry.timestamps.length > 0 ? entry.timestamps[0] : now;

    return this.buildResult({
      allowed,
      count: allowed ? count + 1 : count,
      limit,
      oldestScore,
      now,
      degraded: true,
    });
  }

  private buildResult(args: {
    allowed: boolean;
    count: number;
    limit: number;
    oldestScore: number;
    now: number;
    degraded: boolean;
  }): RateLimitResult {
    const { allowed, count, limit, oldestScore, now, degraded } = args;
    const remaining = Math.max(0, limit - count);
    // The window resets when the oldest in-window request ages out.
    const resetMs = oldestScore + WINDOW_MS;
    const resetSeconds = Math.ceil(resetMs / 1000);
    const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((resetMs - now) / 1000));

    return {
      allowed,
      limit,
      remaining,
      resetSeconds,
      retryAfterSeconds,
      degraded,
    };
  }

  private warnDegraded(err: unknown): void {
    const now = Date.now();
    if (now - this.lastDegradedWarn > 10_000) {
      this.lastDegradedWarn = now;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Redis unavailable for rate limiting, falling back to in-memory limiting at 50% capacity: ${message}`,
      );
    }
  }

  /** Test helper: clear the in-memory store. */
  resetMemory(): void {
    this.memoryStore.clear();
  }
}
