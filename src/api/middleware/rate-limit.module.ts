import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { RateLimitMiddleware } from './rate-limit.middleware';

/**
 * Wires the sliding-window rate limiter into the request pipeline for all routes.
 * Exemptions (`/health`, `/metrics`) are handled inside the middleware itself so
 * the routing config stays simple and the exempt list lives next to the rules.
 */
@Module({
  providers: [RateLimitService, RateLimitMiddleware],
  exports: [RateLimitService],
})
export class RateLimitModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
