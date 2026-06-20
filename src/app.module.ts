import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { MerchantsModule } from './merchants/merchants.module';
import { CheckoutModule } from './checkout/checkout.module';
import { PaymentsModule } from './payments/payments.module';
import { StellarModule } from './stellar/stellar.module';
import { WebhookModule } from './webhook/webhook.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { RedisModule } from './redis/redis.module';
import { RateLimitModule } from './api/middleware/rate-limit.module';
import { DynamicCorsMiddleware } from './middleware/dynamic-cors.middleware';
import { SecurityHeadersMiddleware } from './middleware/security-headers.middleware';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    RedisModule,
    RateLimitModule,
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
