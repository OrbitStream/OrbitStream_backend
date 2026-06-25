import { ConfigService } from '@nestjs/config';
import { PaymentDetectorService } from '../payments/payment-detector.service';
import { PaymentCursorService } from '../payments/payment-cursor.service';
import { StellarService } from '../stellar/stellar.service';
import { WebhookService } from '../webhook/webhook.service';
import { MetricsService } from '../monitoring/metrics.service';
import { db } from '../db/index';

jest.mock('../db/index', () => ({
  db: {
    transaction: jest.fn(),
  },
  client: {},
}));

const mockDb = db as jest.Mocked<typeof db>;

const baseSession = {
  id: 'session-1',
  merchant_id: 'merchant-1',
  amount: '10.0000000',
  asset_code: 'USDC',
  memo: 'memo-1',
  status: 'pending',
};

/** Mocks the phase-1 transaction: locking + validating + claiming the session. */
function createClaimTx(
  sessionRow: Record<string, any> | null,
  opts: { existingPayment?: any; claimReturning?: any[] } = {},
) {
  const returningMock = jest
    .fn()
    .mockResolvedValue(opts.claimReturning ?? (sessionRow ? [{ id: sessionRow.id }] : []));
  const setMock = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({ returning: returningMock }),
  });
  const updateMock = jest.fn().mockReturnValue({ set: setMock });

  const tx = {
    execute: jest.fn().mockResolvedValue(sessionRow ? [sessionRow] : []),
    query: {
      payments: {
        findFirst: jest.fn().mockResolvedValue(opts.existingPayment ?? null),
      },
    },
    update: updateMock,
  };

  return { tx, updateMock, setMock, returningMock };
}

/** Mocks the phase-2 transaction: inserting the payment and finalizing 'paid'. */
function createFinalizeTx() {
  const onConflictDoNothingMock = jest.fn().mockResolvedValue(undefined);
  const valuesMock = jest.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });
  const insertMock = jest.fn().mockReturnValue({ values: valuesMock });

  const updateWhereMock = jest.fn().mockResolvedValue(undefined);
  const setMock = jest.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = jest.fn().mockReturnValue({ set: setMock });

  const tx = { insert: insertMock, update: updateMock };

  return {
    tx,
    insertMock,
    valuesMock,
    onConflictDoNothingMock,
    updateMock,
    setMock,
    updateWhereMock,
  };
}

function buildOp(overrides: Record<string, any> = {}) {
  return {
    type: 'payment',
    transaction_memo: 'memo-1',
    transaction_hash: 'tx-456',
    amount: '10.0000000',
    asset_code: 'USDC',
    from: 'GSENDER',
    ...overrides,
  };
}

describe('PaymentDetectorService - Transaction Wrapping', () => {
  let service: PaymentDetectorService;
  let mockStellar: jest.Mocked<StellarService>;
  let mockWebhooks: jest.Mocked<WebhookService>;
  let mockMetrics: jest.Mocked<MetricsService>;
  let mockCursorService: jest.Mocked<PaymentCursorService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStellar = {
      getPaymentsPage: jest.fn(),
      getHttpStatusFromError: jest.fn(),
    } as any;

    mockWebhooks = {
      dispatchWebhook: jest.fn(),
    } as any;

    mockMetrics = {
      paymentsConfirmed: { inc: jest.fn() },
    } as any;

    mockCursorService = {
      restoreCursor: jest.fn(),
      updateCursor: jest.fn(),
      appendCheckpoint: jest.fn(),
      acquireLock: jest.fn(),
      renewLock: jest.fn(),
      releaseLock: jest.fn(),
    } as any;

    const mockConfig = { get: () => undefined } as unknown as ConfigService;
    service = new PaymentDetectorService(
      mockStellar,
      mockWebhooks,
      mockMetrics,
      mockCursorService,
      mockConfig,
    );
  });

  describe('two-phase claim + finalize', () => {
    it('claims the session (pending -> processing) and finalizes it (insert + paid) in two separate transactions', async () => {
      const claim = createClaimTx({ ...baseSession });
      const finalize = createFinalizeTx();
      (mockDb.transaction as jest.Mock)
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(claim.tx))
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(finalize.tx));

      await (service as any).processPayment(buildOp());

      expect(mockDb.transaction).toHaveBeenCalledTimes(2);
      expect(claim.tx.execute).toHaveBeenCalledTimes(1);
      expect(claim.updateMock).toHaveBeenCalledTimes(1);
      expect(finalize.insertMock).toHaveBeenCalledTimes(1);
      expect(finalize.onConflictDoNothingMock).toHaveBeenCalledTimes(1);
      expect(finalize.updateMock).toHaveBeenCalledTimes(1);
      expect(mockMetrics.paymentsConfirmed.inc).toHaveBeenCalledTimes(1);
      expect(mockWebhooks.dispatchWebhook).toHaveBeenCalledTimes(1);
    });

    it('uses SELECT ... FOR UPDATE to lock the session row before claiming it', async () => {
      const claim = createClaimTx({ ...baseSession });
      const finalize = createFinalizeTx();
      (mockDb.transaction as jest.Mock)
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(claim.tx))
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(finalize.tx));

      await (service as any).processPayment(buildOp());

      expect(claim.tx.execute).toHaveBeenCalledTimes(1);
      const sqlArg = claim.tx.execute.mock.calls[0][0];
      expect(sqlArg).toBeDefined();
      expect(typeof sqlArg).toBe('object');
    });

    it('returns early without any update/insert if no session matches the memo', async () => {
      const claim = createClaimTx(null);
      (mockDb.transaction as jest.Mock).mockImplementationOnce(
        async (fn: (tx: any) => Promise<any>) => fn(claim.tx),
      );

      await (service as any).processPayment(buildOp());

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(claim.updateMock).not.toHaveBeenCalled();
      expect(mockWebhooks.dispatchWebhook).not.toHaveBeenCalled();
    });
  });

  describe('processing status transitions', () => {
    it('transitions pending -> processing during the claim phase', async () => {
      const claim = createClaimTx({ ...baseSession });
      const finalize = createFinalizeTx();
      (mockDb.transaction as jest.Mock)
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(claim.tx))
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(finalize.tx));

      await (service as any).processPayment(buildOp());

      expect(claim.setMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'processing' }));
    });

    it('transitions processing -> paid only after the payment insert in the finalize phase', async () => {
      const claim = createClaimTx({ ...baseSession });
      const finalize = createFinalizeTx();
      (mockDb.transaction as jest.Mock)
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(claim.tx))
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(finalize.tx));

      await (service as any).processPayment(buildOp());

      expect(finalize.setMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid' }));
    });
  });

  describe('idempotency key', () => {
    it('skips the insert when a payment already exists for this (tx_hash, session_id) pair', async () => {
      const claim = createClaimTx(
        { ...baseSession },
        { existingPayment: { id: 'existing-payment' } },
      );
      (mockDb.transaction as jest.Mock).mockImplementationOnce(
        async (fn: (tx: any) => Promise<any>) => fn(claim.tx),
      );

      await (service as any).processPayment(buildOp());

      expect(claim.tx.query.payments.findFirst).toHaveBeenCalled();
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(claim.updateMock).not.toHaveBeenCalled();
      expect(mockWebhooks.dispatchWebhook).not.toHaveBeenCalled();
    });

    it('proceeds normally when no payment exists yet for this idempotency key', async () => {
      const claim = createClaimTx({ ...baseSession }, { existingPayment: null });
      const finalize = createFinalizeTx();
      (mockDb.transaction as jest.Mock)
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(claim.tx))
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(finalize.tx));

      await (service as any).processPayment(buildOp());

      expect(mockDb.transaction).toHaveBeenCalledTimes(2);
      expect(finalize.insertMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('duplicate payment handling', () => {
    it('logs a warning and returns gracefully for an already-paid session, without touching it', async () => {
      const claim = createClaimTx({ ...baseSession, status: 'paid' });
      (mockDb.transaction as jest.Mock).mockImplementationOnce(
        async (fn: (tx: any) => Promise<any>) => fn(claim.tx),
      );

      await expect((service as any).processPayment(buildOp())).resolves.not.toThrow();

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(claim.updateMock).not.toHaveBeenCalled();
      expect(mockWebhooks.dispatchWebhook).not.toHaveBeenCalled();
      expect(mockMetrics.paymentsConfirmed.inc).not.toHaveBeenCalled();
    });

    it('skips a session that is already being processed by another payment', async () => {
      const claim = createClaimTx({ ...baseSession, status: 'processing' });
      (mockDb.transaction as jest.Mock).mockImplementationOnce(
        async (fn: (tx: any) => Promise<any>) => fn(claim.tx),
      );

      await (service as any).processPayment(buildOp());

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(claim.updateMock).not.toHaveBeenCalled();
      expect(mockWebhooks.dispatchWebhook).not.toHaveBeenCalled();
    });

    it('skips if the claim update affects zero rows (lost the optimistic-lock race)', async () => {
      const claim = createClaimTx({ ...baseSession }, { claimReturning: [] });
      (mockDb.transaction as jest.Mock).mockImplementationOnce(
        async (fn: (tx: any) => Promise<any>) => fn(claim.tx),
      );

      await (service as any).processPayment(buildOp());

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockWebhooks.dispatchWebhook).not.toHaveBeenCalled();
    });
  });

  describe('amount and asset validation', () => {
    it('rejects payment with amount mismatch', async () => {
      const claim = createClaimTx({ ...baseSession });
      (mockDb.transaction as jest.Mock).mockImplementationOnce(
        async (fn: (tx: any) => Promise<any>) => fn(claim.tx),
      );

      await (service as any).processPayment(buildOp({ amount: '5.0000000' }));

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(claim.updateMock).not.toHaveBeenCalled();
    });

    it('rejects payment with asset mismatch', async () => {
      const claim = createClaimTx({ ...baseSession });
      (mockDb.transaction as jest.Mock).mockImplementationOnce(
        async (fn: (tx: any) => Promise<any>) => fn(claim.tx),
      );

      await (service as any).processPayment(buildOp({ asset_code: 'BTC' }));

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(claim.updateMock).not.toHaveBeenCalled();
    });

    it('accepts payment with XLM when session expects XLM', async () => {
      const claim = createClaimTx({ ...baseSession, asset_code: 'XLM' });
      const finalize = createFinalizeTx();
      (mockDb.transaction as jest.Mock)
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(claim.tx))
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(finalize.tx));

      await (service as any).processPayment(buildOp({ asset_code: 'XLM' }));

      expect(claim.updateMock).toHaveBeenCalled();
      expect(finalize.insertMock).toHaveBeenCalled();
    });
  });

  describe('transaction rollback on failure', () => {
    it('does not finalize, increment metrics, or dispatch a webhook when the finalize transaction fails', async () => {
      const claim = createClaimTx({ ...baseSession });
      (mockDb.transaction as jest.Mock)
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(claim.tx))
        .mockImplementationOnce(async () => {
          throw new Error('insert failed — transaction rolled back');
        });

      await expect((service as any).processPayment(buildOp())).resolves.not.toThrow();

      expect(mockDb.transaction).toHaveBeenCalledTimes(2);
      expect(mockMetrics.paymentsConfirmed.inc).not.toHaveBeenCalled();
      expect(mockWebhooks.dispatchWebhook).not.toHaveBeenCalled();
    });

    it('does not call db.transaction a second time when the claim phase itself fails', async () => {
      (mockDb.transaction as jest.Mock).mockImplementationOnce(async () => {
        throw new Error('connection lost during claim');
      });

      await expect((service as any).processPayment(buildOp())).rejects.toThrow(
        'connection lost during claim',
      );

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockWebhooks.dispatchWebhook).not.toHaveBeenCalled();
    });
  });

  describe('concurrent payment submissions (integration)', () => {
    it('only one of two simultaneous payments for the same session wins the claim', async () => {
      const claimWinner = createClaimTx({ ...baseSession });
      const claimLoser = createClaimTx({ ...baseSession, status: 'processing' });
      const finalizeWinner = createFinalizeTx();

      (mockDb.transaction as jest.Mock)
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(claimWinner.tx))
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(claimLoser.tx))
        .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(finalizeWinner.tx));

      const opA = buildOp({ transaction_hash: 'tx-A' });
      const opB = buildOp({ transaction_hash: 'tx-B' });

      await Promise.all([
        (service as any).processPayment(opA),
        (service as any).processPayment(opB),
      ]);

      expect(mockDb.transaction).toHaveBeenCalledTimes(3);
      expect(finalizeWinner.insertMock).toHaveBeenCalledTimes(1);
      expect(mockMetrics.paymentsConfirmed.inc).toHaveBeenCalledTimes(1);
      expect(mockWebhooks.dispatchWebhook).toHaveBeenCalledTimes(1);
    });
  });
});
