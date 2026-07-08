import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { db } from '../db/index';
import { checkoutSessions, payments } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import * as crypto from 'crypto';
import { AuditService } from '../audit/audit.service';
import { Config } from '../config/config.schema';

@Injectable()
export class CheckoutService {
  private readonly frontendUrl: string;
  private readonly sessionTtlMinutes: number;

  constructor(
    private readonly auditService: AuditService,
    private readonly config: ConfigService<Config>,
  ) {
    this.frontendUrl = this.config.get('FRONTEND_URL', { infer: true }) ?? 'http://localhost:3000';
    this.sessionTtlMinutes = this.config.get('CHECKOUT_SESSION_TTL_MINUTES', { infer: true }) ?? 30;
  }

  async createSession(
    merchantId: string,
    dto: {
      amount: number;
      asset: string;
      assetIssuer?: string;
      successUrl?: string;
      cancelUrl?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const memo = crypto.randomBytes(8).toString('hex');
    const receivingAccount = this.config.get('PLATFORM_RECEIVING_ACCOUNT', { infer: true });
    if (!receivingAccount) {
      throw new BadRequestException('Platform receiving account not configured');
    }

    const expiresAt = new Date(Date.now() + this.sessionTtlMinutes * 60 * 1000);

    const [session] = await db
      .insert(checkoutSessions)
      .values({
        merchantId,
        amount: dto.amount.toString(),
        assetCode: dto.asset,
        assetIssuer: dto.assetIssuer ?? null,
        receivingAccount,
        memo,
        status: 'pending',
        successUrl: dto.successUrl ?? null,
        cancelUrl: dto.cancelUrl ?? null,
        metadata: dto.metadata ?? null,
        expiresAt,
      } as any)
      .returning();

    const url = `${this.frontendUrl}/checkout/${session.id}`;

    return {
      id: session.id,
      url,
      amount: session.amount,
      asset: session.assetCode,
      status: session.status,
      expiresAt: session.expiresAt,
    };
  }

  async getSession(sessionId: string) {
    const session = await db.query.checkoutSessions.findFirst({
      where: eq(checkoutSessions.id, sessionId),
    });
    if (!session) throw new NotFoundException('Session not found');

    if (session.status === 'pending' && new Date() > session.expiresAt) {
      await db
        .update(checkoutSessions)
        .set({ status: 'expired' } as any)
        .where(eq(checkoutSessions.id, sessionId));
      return { ...this.toPublicSession(session), status: 'expired' as const };
    }

    return this.toPublicSession(session);
  }

  toPublicSession(session: any) {
    return {
      id: session.id,
      url: `${this.frontendUrl}/checkout/${session.id}`,
      amount: session.amount,
      asset: session.assetCode,
      status: session.status,
      expiresAt: session.expiresAt,
    };
  }

  async cancelSession(sessionId: string, merchantId: string) {
    const session = await db.query.checkoutSessions.findFirst({
      where: and(eq(checkoutSessions.id, sessionId), eq(checkoutSessions.merchantId, merchantId)),
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== 'pending') {
      throw new BadRequestException('Session is not pending');
    }

    const [updated] = await db
      .update(checkoutSessions)
      .set({ status: 'cancelled' } as any)
      .where(eq(checkoutSessions.id, sessionId))
      .returning();

    await this.auditService.logSensitiveOperation({
      merchantId,
      action: 'session_cancelled',
      resourceType: 'checkout_session',
      resourceId: sessionId,
    });

    return updated;
  }

  async markAsPaid(sessionId: string) {
    const [updated] = await db
      .update(checkoutSessions)
      .set({ status: 'paid' } as any)
      .where(eq(checkoutSessions.id, sessionId))
      .returning();
    return updated;
  }

  async getSessionPayment(sessionId: string) {
    const session = await db.query.checkoutSessions.findFirst({
      where: eq(checkoutSessions.id, sessionId),
    });
    if (!session) throw new NotFoundException('Session not found');

    const payment = await db.query.payments.findFirst({
      where: eq(payments.sessionId, sessionId),
    });
    if (!payment) throw new NotFoundException('Payment not found for session');

    return {
      id: payment.id,
      sessionId: payment.sessionId,
      txHash: payment.txHash,
      amount: payment.amount,
      asset: payment.assetCode,
      sender: payment.senderAddress,
      confirmedAt: payment.confirmedAt,
    };
  }
}
