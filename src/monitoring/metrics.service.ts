import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly checkoutSessionsCreated = new Counter({
    name: 'stellar_checkout_sessions_created_total',
    help: 'Total checkout sessions created',
    registers: [this.registry],
  });

  readonly paymentsConfirmed = new Counter({
    name: 'stellar_checkout_payments_confirmed_total',
    help: 'Total payments confirmed',
    registers: [this.registry],
  });

  readonly paymentDetectionLatency = new Histogram({
    name: 'stellar_checkout_payment_detection_latency_seconds',
    help: 'Time between payment submission and detection',
    buckets: [1, 2, 5, 10, 30, 60],
    registers: [this.registry],
  });

  readonly webhookDeliverySuccess = new Counter({
    name: 'stellar_checkout_webhook_delivery_success_total',
    help: 'Successful webhook deliveries',
    registers: [this.registry],
  });

  readonly webhookDeliveryFailure = new Counter({
    name: 'stellar_checkout_webhook_delivery_failure_total',
    help: 'Failed webhook deliveries',
    registers: [this.registry],
  });

  readonly requestDuration = new Histogram({
    name: 'stellar_checkout_request_duration_seconds',
    help: 'Request duration in seconds',
    labelNames: ['method', 'path'],
    registers: [this.registry],
  });
}
