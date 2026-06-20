import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { db } from '../db/index';
import { checkoutSessions, payments } from '../db/schema';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { WebhookService } from '../webhook/webhook.service';

const STALE_MINUTES = 5;

interface StaleSessionRow {
  id: string;
  memo: string | null;
}

interface PaidWithoutPaymentRow {
  id: string;
  merchant_id: string;
  amount: string;
  asset_code: string;
}

interface PendingWithPaymentRow {
  id: string;
  merchant_id: string;
  tx_hash: string;
  amount: string;
  asset_code: string;
  sender_address: string;
}

@Injectable()
export class PaymentRecoveryService {
  private readonly logger = new Logger(PaymentRecoveryService.name);

  constructor(private readonly webhooks: WebhookService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async recoverStaleSessions(): Promise<void> {
    this.logger.debug('Running payment recovery job');

    await this.recoverPendingWithPayments();
    await this.recoverStuckPending();
    await this.recoverPaidWithoutPayments();
  }

  private async recoverPendingWithPayments(): Promise<void> {
    const orphaned = (await db.execute(sql`
      SELECT cs.id, cs.merchant_id, p.tx_hash, p.amount, p.asset_code, p.sender_address, p.confirmed_at
      FROM checkout_sessions cs
      INNER JOIN payments p ON p.session_id = cs.id
      WHERE cs.status = 'pending'
    `)) as unknown as PendingWithPaymentRow[];

    if (!orphaned.length) return;

    this.logger.warn(
      `Found ${orphaned.length} pending session(s) with existing payment records — recovering`,
    );

    for (const row of orphaned) {
      try {
        await db
          .update(checkoutSessions)
          .set({ status: 'paid' } as any)
          .where(eq(checkoutSessions.id, row.id));

        this.logger.log(`Recovered session ${row.id} — marked as paid`);

        await this.webhooks.dispatchWebhook(row.merchant_id, 'payment.confirmed', {
          sessionId: row.id,
          txHash: row.tx_hash,
          amount: row.amount,
          asset: row.asset_code,
          sender: row.sender_address,
        });
      } catch (err) {
        this.logger.error(`Failed to recover session ${row.id}`, err);
      }
    }
  }

  private async recoverStuckPending(): Promise<void> {
    const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

    const stale = (await db.execute(sql`
      SELECT id, memo FROM checkout_sessions
      WHERE status = 'pending' AND created_at < ${staleThreshold}
    `)) as unknown as StaleSessionRow[];

    if (!stale.length) return;

    this.logger.warn(
      `Found ${stale.length} session(s) stuck in pending for >${STALE_MINUTES} minutes`,
    );

    for (const row of stale) {
      const paymentExists = await db.query.payments.findFirst({
        where: eq(payments.sessionId, row.id),
      });

      if (paymentExists) {
        await db
          .update(checkoutSessions)
          .set({ status: 'paid' } as any)
          .where(eq(checkoutSessions.id, row.id));
        this.logger.log(`Recovered stale session ${row.id} — payment exists, marked as paid`);
      } else {
        await db
          .update(checkoutSessions)
          .set({ status: 'expired' } as any)
          .where(eq(checkoutSessions.id, row.id));
        this.logger.log(`Recovered stale session ${row.id} — no payment, marked as expired`);
      }
    }
  }

  private async recoverPaidWithoutPayments(): Promise<void> {
    const paidOrphans = (await db.execute(sql`
      SELECT cs.id, cs.merchant_id, cs.amount, cs.asset_code
      FROM checkout_sessions cs
      LEFT JOIN payments p ON p.session_id = cs.id
      WHERE cs.status = 'paid' AND p.id IS NULL
    `)) as unknown as PaidWithoutPaymentRow[];

    if (!paidOrphans.length) return;

    this.logger.warn(
      `Found ${paidOrphans.length} paid session(s) without payment records — logging for manual review`,
    );

    for (const row of paidOrphans) {
      this.logger.warn(
        `Paid session ${row.id} (merchant ${row.merchant_id}) has no payment record — requires manual investigation`,
      );
    }
  }
}
