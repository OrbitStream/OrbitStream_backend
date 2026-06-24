import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { db } from '../db/index';
import { checkoutSessions, payments } from '../db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { StellarService } from '../stellar/stellar.service';
import { WebhookService } from '../webhook/webhook.service';

const STALE_MINUTES = 5;

interface StaleSessionRow {
  id: string;
  memo: string | null;
}

interface StuckProcessingRow {
  id: string;
  merchant_id: string;
  memo: string | null;
  amount: string;
  asset_code: string;
  asset_issuer: string | null;
  receiving_account: string;
}

interface PaidWithoutPaymentRow {
  id: string;
  merchant_id: string;
  amount: string;
  asset_code: string;
  memo: string | null;
  receiving_account: string;
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

  constructor(
    private readonly webhooks: WebhookService,
    private readonly stellar: StellarService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async recoverStaleSessions(): Promise<void> {
    this.logger.debug('Running payment recovery job');

    await this.recoverStuckProcessing();
    await this.recoverPendingWithPayments();
    await this.recoverStuckPending();
    await this.recoverPaidWithoutPayments();
  }

  /**
   * Sessions stuck in 'processing' mean processPayment's claim phase committed
   * but the process crashed (or errored) before the payment insert + paid
   * transition could commit. Re-checks Horizon by memo to decide whether to
   * complete the payment or release the session back to 'pending'.
   */
  private async recoverStuckProcessing(): Promise<void> {
    const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

    const stuck = (await db.execute(sql`
      SELECT id, merchant_id, memo, amount, asset_code, asset_issuer, receiving_account
      FROM checkout_sessions
      WHERE status = 'processing' AND created_at < ${staleThreshold}
    `)) as unknown as StuckProcessingRow[];

    if (!stuck.length) return;

    this.logger.warn(
      `Found ${stuck.length} session(s) stuck in processing for >${STALE_MINUTES} minutes`,
    );

    for (const row of stuck) {
      try {
        await this.reconcileStuckSession(row);
      } catch (err) {
        this.logger.error(`Failed to reconcile stuck session ${row.id}`, err as Error);
      }
    }
  }

  private async reconcileStuckSession(row: StuckProcessingRow): Promise<void> {
    const match = row.memo ? await this.findConfirmingPayment(row) : null;

    if (!match) {
      this.logger.warn(
        `Stuck session ${row.id} — no confirming payment found on Horizon, reverting to pending`,
      );
      await this.revertToPending(row.id);
      return;
    }

    const confirmed = await this.stellar.verifyTransaction(match.transaction_hash);
    if (!confirmed) {
      this.logger.warn(
        `Stuck session ${row.id} — transaction ${match.transaction_hash} not successful on Horizon, reverting to pending`,
      );
      await this.revertToPending(row.id);
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(payments)
        .values({
          sessionId: row.id,
          merchantId: row.merchant_id,
          txHash: match.transaction_hash,
          amount: match.amount,
          assetCode: match.asset_code ?? 'XLM',
          assetIssuer: match.asset_issuer ?? null,
          senderAddress: match.from,
          confirmedAt: new Date(),
        } as any)
        .onConflictDoNothing({ target: [payments.txHash, payments.sessionId] });

      await tx
        .update(checkoutSessions)
        .set({ status: 'paid' } as any)
        .where(eq(checkoutSessions.id, row.id));
    });

    this.logger.log(
      `Recovered stuck session ${row.id} — confirmed via Horizon tx ${match.transaction_hash}, marked as paid`,
    );

    await this.webhooks.dispatchWebhook(row.merchant_id, 'payment.confirmed', {
      sessionId: row.id,
      txHash: match.transaction_hash,
      amount: match.amount,
      asset: match.asset_code ?? 'XLM',
      sender: match.from,
    });
  }

  /** Searches the receiving account's recent Horizon payments for one matching this session. */
  private async findConfirmingPayment(row: StuckProcessingRow | PaidWithoutPaymentRow): Promise<any | null> {
    const records = await this.stellar.getPaymentsForAccount(
      row.receiving_account,
      undefined,
      'desc',
    );

    const sessionAmount = parseFloat(row.amount);
    return (
      records.find(
        (r: any) =>
          r.type === 'payment' &&
          r.transaction_memo === row.memo &&
          Math.abs(parseFloat(r.amount) - sessionAmount) < 0.0000001 &&
          (r.asset_code === row.asset_code || row.asset_code === 'XLM'),
      ) ?? null
    );
  }

  /** Releases a stuck 'processing' session back to 'pending' so it can be re-detected. */
  private async revertToPending(sessionId: string): Promise<void> {
    await db
      .update(checkoutSessions)
      .set({ status: 'pending' } as any)
      .where(and(eq(checkoutSessions.id, sessionId), eq(checkoutSessions.status, 'processing')));
    this.logger.log(`Reverted session ${sessionId} to pending for re-detection`);
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

  /**
   * Sessions marked 'paid' with no corresponding payment record indicate the
   * payment insert in phase 2 was lost (e.g. the process died after committing
   * the status update). For each orphan, query Horizon to find the confirming
   * transaction and back-fill the missing payment row. If no confirming payment
   * can be found, the session is left in 'paid' and logged for manual review.
   */
  private async recoverPaidWithoutPayments(): Promise<void> {
    const paidOrphans = (await db.execute(sql`
      SELECT cs.id, cs.merchant_id, cs.amount, cs.asset_code, cs.memo, cs.receiving_account
      FROM checkout_sessions cs
      LEFT JOIN payments p ON p.session_id = cs.id
      WHERE cs.status = 'paid' AND p.id IS NULL
    `)) as unknown as PaidWithoutPaymentRow[];

    if (!paidOrphans.length) return;

    this.logger.warn(
      `Found ${paidOrphans.length} paid session(s) without payment records — querying Horizon to recover`,
    );

    for (const row of paidOrphans) {
      try {
        const match = row.memo ? await this.findConfirmingPayment(row) : null;

        if (!match) {
          this.logger.warn(
            `Paid session ${row.id} (merchant ${row.merchant_id}) — no matching Horizon payment found; requires manual investigation`,
          );
          continue;
        }

        const confirmed = await this.stellar.verifyTransaction(match.transaction_hash);
        if (!confirmed) {
          this.logger.warn(
            `Paid session ${row.id} — Horizon tx ${match.transaction_hash} is not successful; requires manual investigation`,
          );
          continue;
        }

        await db
          .insert(payments)
          .values({
            sessionId: row.id,
            merchantId: row.merchant_id,
            txHash: match.transaction_hash,
            amount: match.amount,
            assetCode: match.asset_code ?? 'XLM',
            assetIssuer: match.asset_issuer ?? null,
            senderAddress: match.from,
            confirmedAt: new Date(),
          } as any)
          .onConflictDoNothing({ target: [payments.txHash, payments.sessionId] });

        this.logger.log(
          `Back-filled payment record for session ${row.id} — Horizon tx ${match.transaction_hash}`,
        );
      } catch (err) {
        this.logger.error(`Failed to recover paid session ${row.id}`, err as Error);
      }
    }
  }
}
