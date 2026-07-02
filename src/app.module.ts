import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { MerchantsModule } from './merchants/merchants.module';
import { CheckoutModule } from './checkout/checkout.module';
import { PaymentsModule } from './payments/payments.module';
import { StellarModule } from './stellar/stellar.module';
import { WebhookModule } from './webhook/webhook.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { RedisModule } from './redis/redis.module';
import { RateLimitModule } from './api/middleware/rate-limit.module';
import { AuditModule } from './audit/audit.module';
import { ConfigModule } from './config/config.module';
import { DynamicCorsMiddleware } from './middleware/dynamic-cors.middleware';
import { SecurityHeadersMiddleware } from './middleware/security-headers.middleware';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    RedisModule,
    RateLimitModule,
    AuditModule,
    AuthModule,
    MerchantsModule,
    CheckoutModule,
    PaymentsModule,
    StellarModule,
    WebhookModule,
    MonitoringModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');

    consumer.apply(DynamicCorsMiddleware).forRoutes('*');
  }
}
