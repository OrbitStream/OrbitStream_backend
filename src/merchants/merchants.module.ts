import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';
import { CorsOriginsCacheService } from '../middleware/cors-origins-cache.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [MerchantsController],
  providers: [MerchantsService, CorsOriginsCacheService],
  exports: [MerchantsService, CorsOriginsCacheService],
})
export class MerchantsModule {}
