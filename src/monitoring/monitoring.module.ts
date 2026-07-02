import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DrizzleHealthIndicator } from './drizzle-health.indicator';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController, MetricsController],
  providers: [MetricsService, DrizzleHealthIndicator],
  exports: [MetricsService],
})
export class MonitoringModule {}
