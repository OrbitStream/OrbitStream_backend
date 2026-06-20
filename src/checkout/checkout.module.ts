import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { MerchantsModule } from '../merchants/merchants.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [MerchantsModule, AuditModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
