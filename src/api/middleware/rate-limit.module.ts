import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { AdaptiveLimitService } from './adaptive-limit.service';
import { RateLimitMiddleware } from './rate-limit.middleware';
import { MerchantsModule } from '../../merchants/merchants.module';

/**
 * Wires the sliding-window rate limiter into the request pipeline for all routes.
 * Exemptions (`/health`, `/metrics`) are handled inside the middleware itself so
 * the routing config stays simple and the exempt list lives next to the rules.
 *
 * `MerchantsModule` is imported so the middleware can resolve the merchant behind
 * an API key when applying the high-volume adaptive bonus.
 */
@Module({
  imports: [MerchantsModule],
  providers: [RateLimitService, AdaptiveLimitService, RateLimitMiddleware],
  exports: [RateLimitService, AdaptiveLimitService],
})
export class RateLimitModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
