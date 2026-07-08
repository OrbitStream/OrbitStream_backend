import { Injectable, Logger } from '@nestjs/common';
import { db } from '../db/index';
import { webhookDeadLetters, webhookDeliveries, webhookEndpoints, merchants } from '../db/schema';
import { and, desc, eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import { WebhookQueueService } from './webhook-queue.service';

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

  /** Recent delivery records for a merchant (most recent first). */
  async listDeliveries(merchantId: string, limit = 50) {
    return db.query.webhookDeliveries.findMany({
      where: eq(webhookDeliveries.merchantId, merchantId),
      orderBy: [desc(webhookDeliveries.createdAt)],
      limit,
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

  // ── Webhook Endpoints CRUD ──

  async createEndpoint(merchantId: string, url: string, events: string[]) {
    const secret = 'whsec_' + crypto.randomBytes(24).toString('hex');
    const [endpoint] = await db
      .insert(webhookEndpoints)
      .values({ merchantId, url, events, secret } as any)
      .returning();
    return this.toEndpointDto(endpoint);
  }

  async listEndpoints(merchantId: string) {
    const endpoints = await db.query.webhookEndpoints.findMany({
      where: eq(webhookEndpoints.merchantId, merchantId),
      orderBy: [desc(webhookEndpoints.createdAt)],
    });
    return endpoints.map((e) => this.toEndpointDto(e));
  }

  async deleteEndpoint(merchantId: string, endpointId: string): Promise<boolean> {
    const [deleted] = await db
      .delete(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.merchantId, merchantId)))
      .returning();
    return !!deleted;
  }

  private toEndpointDto(endpoint: any) {
    return {
      id: endpoint.id,
      url: endpoint.url,
      events: endpoint.events,
      secret: endpoint.secret,
      active: endpoint.isActive,
      createdAt: endpoint.createdAt,
    };
  }
}
