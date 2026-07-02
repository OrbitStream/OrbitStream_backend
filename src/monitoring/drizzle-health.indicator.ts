import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { db } from '../db';

@Injectable()
export class DrizzleHealthIndicator extends HealthIndicator {
  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      await db.execute(sql`SELECT 1`);

      return this.getStatus(key, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Database health check failed';

      throw new HealthCheckError(
        `${key} is not available`,
        this.getStatus(key, false, { message }),
      );
    }
  }
}
