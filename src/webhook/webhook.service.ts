import { Injectable, Logger } from '@nestjs/common';
import { db } from '../db/index';
import { webhookDeadLetters, webhookDeliveries, merchants } from '../db/schema';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { WebhookQueueService } from './webhook-queue.service';

export interface ListDeliveriesOptions {
  limit?: number;
  event?: string;
  status?: string;
  after?: Date;
  before?: Date;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly queue: WebhookQueueService) {}

  /**
   * Enqueue a webhook for asynchronous, retrying, ordered delivery. The actual
   * HTTP delivery, retries, dead-lettering and ordering are handled by the queue.
   */
  async dispatchWebhook(merchantId: string, event: string, data: any): Promise<void> {
    const merchant = await db.query.merchants.findFirst({
      where: eq(merchants.id, merchantId),
    });
    if (!merchant?.webhookUrl || !merchant?.webhookSecret) {
      this.logger.debug(`No webhook configured for merchant ${merchantId}`);
      return;
    }

    const sessionId = data?.sessionId ?? data?.session_id ?? null;
    await this.queue.enqueue({ merchantId, event, body: data, sessionId });
  }

  /** Recent delivery records for a merchant with optional filtering. */
  async listDeliveries(merchantId: string, options: ListDeliveriesOptions = {}) {
    const { limit = 50, event, status, after, before } = options;

    const conditions = [eq(webhookDeliveries.merchantId, merchantId)];
    if (event) conditions.push(eq(webhookDeliveries.event, event));
    if (status) conditions.push(eq(webhookDeliveries.status, status as any));
    if (after) conditions.push(gte(webhookDeliveries.createdAt, after));
    if (before) conditions.push(lte(webhookDeliveries.createdAt, before));

    return db.query.webhookDeliveries.findMany({
      where: and(...conditions),
      orderBy: [desc(webhookDeliveries.createdAt)],
      limit: Math.min(limit, 100),
    });
  }

  /** Single delivery record with full attempt log. */
  async getDelivery(merchantId: string, deliveryId: string) {
    return db.query.webhookDeliveries.findFirst({
      where: and(
        eq(webhookDeliveries.merchantId, merchantId),
        eq(webhookDeliveries.deliveryId, deliveryId),
      ),
    });
  }

  /** Dead-letter entries for a merchant (most recent first). */
  async listDeadLetters(merchantId: string, limit = 50) {
    return db.query.webhookDeadLetters.findMany({
      where: eq(webhookDeadLetters.merchantId, merchantId),
      orderBy: [desc(webhookDeadLetters.createdAt)],
      limit,
    });
  }

  /** Manually re-enqueue a dead-letter entry. Returns the new delivery id. */
  async retryDeadLetter(merchantId: string, deadLetterId: string) {
    const newId = await this.queue.requeueDeadLetter(merchantId, deadLetterId);
    if (!newId) return null;
    return { deliveryId: newId };
  }

  /** Dismiss (delete) a dead-letter entry scoped to the merchant. */
  async dismissDeadLetter(merchantId: string, deadLetterId: string): Promise<boolean> {
    const [deleted] = await db
      .delete(webhookDeadLetters)
      .where(
        and(eq(webhookDeadLetters.id, deadLetterId), eq(webhookDeadLetters.merchantId, merchantId)),
      )
      .returning();
    return !!deleted;
  }
}
