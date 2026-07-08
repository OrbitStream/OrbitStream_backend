import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { db } from '../db/index';
import { sql } from 'drizzle-orm';

@Controller('health')
export class HealthController {
  constructor(private health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => {
        await db.execute(sql`SELECT 1`);
        return { database: { status: 'up' } };
      },
    ]);
  }
}
