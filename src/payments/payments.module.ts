import { Module } from '@nestjs/common';
import { PaymentDetectorService } from './payment-detector.service';
import { StellarModule } from '../stellar/stellar.module';
import { WebhookModule } from '../webhook/webhook.module';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [StellarModule, WebhookModule, MonitoringModule],
  providers: [PaymentDetectorService],
})
export class PaymentsModule {}
