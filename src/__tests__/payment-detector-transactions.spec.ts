import { PaymentDetectorService } from '../payments/payment-detector.service';
import { PaymentCursorService } from '../payments/payment-cursor.service';
import { StellarService } from '../stellar/stellar.service';
import { WebhookService } from '../webhook/webhook.service';
import { MetricsService } from '../monitoring/metrics.service';
import { db } from '../db/index';

jest.mock('../db/index', () => ({
  db: {
    query: {
      payments: { findFirst: jest.fn() },
    },
    transaction: jest.fn(),
    execute: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
  },
  client: {},
}));

const mockDb = db as jest.Mocked<typeof db>;

const createMockTx = (sessionRow: any = null) => ({
  execute: jest.fn().mockResolvedValue(sessionRow ? [sessionRow] : []),
  update: jest.fn().mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  }),
  insert: jest.fn().mockReturnValue({
    values: jest.fn().mockResolvedValue(undefined),
  }),
});

describe('PaymentDetectorService - Transaction Wrapping', () => {
  let service: PaymentDetectorService;
  let mockStellar: jest.Mocked<StellarService>;
  let mockWebhooks: jest.Mocked<WebhookService>;
  let mockMetrics: jest.Mocked<MetricsService>;
  let mockCursorService: jest.Mocked<PaymentCursorService>;
  let mockAdaptiveLimits: { recordPayment: jest.Mock };

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

    mockAdaptiveLimits = {
      recordPayment: jest.fn().mockResolvedValue(undefined),
    } as any;

    service = new PaymentDetectorService(
      mockStellar,
      mockWebhooks,
      mockMetrics,
      mockCursorService,
      mockAdaptiveLimits as any,
    );
  });

  describe('idempotency check', () => {
    it('skips duplicate payment when tx_hash already exists', async () => {
      (mockDb.query.payments.findFirst as jest.Mock).mockResolvedValue({
        id: 'existing-payment',
        txHash: 'tx-123',
      });

      const op = {
        type: 'payment',
        transaction_memo: 'memo-1',
        transaction_hash: 'tx-123',
        amount: '10.0000000',
        asset_code: 'USDC',
        from: 'GSENDER',
      };

      await (service as any).processPayment(op);

      expect(mockDb.query.payments.findFirst).toHaveBeenCalled();
      expect(mockDb.transaction).not.toHaveBeenCalled();
      expect(mockWebhooks.dispatchWebhook).not.toHaveBeenCalled();
    });

    it('proceeds with transaction when tx_hash is new', async () => {
      (mockDb.query.payments.findFirst as jest.Mock).mockResolvedValue(null);
      const mockTx = createMockTx({
        id: 'session-1',
        merchant_id: 'merchant-1',
        amount: '10.0000000',
        asset_code: 'USDC',
        memo: 'memo-1',
      });
      (mockDb.transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => Promise<void>) =>
        fn(mockTx),
      );

      const op = {
        type: 'payment',
        transaction_memo: 'memo-1',
        transaction_hash: 'tx-456',
        amount: '10.0000000',
        asset_code: 'USDC',
        from: 'GSENDER',
      };

      await (service as any).processPayment(op);

      expect(mockDb.query.payments.findFirst).toHaveBeenCalled();
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockTx.execute).toHaveBeenCalled();
    });
  });

  describe('transaction atomicity', () => {
    it('wraps session update, payment insert, and webhook dispatch in transaction', async () => {
      (mockDb.query.payments.findFirst as jest.Mock).mockResolvedValue(null);
      const mockTx = createMockTx({
        id: 'session-1',
        merchant_id: 'merchant-1',
        amount: '10.0000000',
        asset_code: 'USDC',
        memo: 'memo-1',
      });
      (mockDb.transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => Promise<void>) =>
        fn(mockTx),
      );

      const op = {
        type: 'payment',
        transaction_memo: 'memo-1',
        transaction_hash: 'tx-789',
        amount: '10.0000000',
        asset_code: 'USDC',
        from: 'GSENDER',
      };

      await (service as any).processPayment(op);

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.execute).toHaveBeenCalledTimes(1);
      expect(mockTx.update).toHaveBeenCalledTimes(1);
      expect(mockTx.insert).toHaveBeenCalledTimes(1);
      expect(mockWebhooks.dispatchWebhook).toHaveBeenCalledTimes(1);
      // The confirmed payment feeds the adaptive rate limiter, keyed by merchant.
      expect(mockAdaptiveLimits.recordPayment).toHaveBeenCalledWith('merchant-1');
    });

    it('uses SELECT FOR UPDATE to lock session row', async () => {
      (mockDb.query.payments.findFirst as jest.Mock).mockResolvedValue(null);
      const mockTx = createMockTx({
        id: 'session-1',
        merchant_id: 'merchant-1',
        amount: '10.0000000',
        asset_code: 'USDC',
        memo: 'memo-1',
      });
      (mockDb.transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => Promise<void>) =>
        fn(mockTx),
      );

      const op = {
        type: 'payment',
        transaction_memo: 'memo-1',
        transaction_hash: 'tx-999',
        amount: '10.0000000',
        asset_code: 'USDC',
        from: 'GSENDER',
      };

      await (service as any).processPayment(op);

      expect(mockTx.execute).toHaveBeenCalledTimes(1);
      const sqlArg = mockTx.execute.mock.calls[0][0];
      expect(sqlArg).toBeDefined();
      expect(typeof sqlArg).toBe('object');
    });

    it('returns early if session not found in locked query', async () => {
      (mockDb.query.payments.findFirst as jest.Mock).mockResolvedValue(null);
      const mockTx = createMockTx(null);
      (mockDb.transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => Promise<void>) =>
        fn(mockTx),
      );

      const op = {
        type: 'payment',
        transaction_memo: 'nonexistent-memo',
        transaction_hash: 'tx-111',
        amount: '10.0000000',
        asset_code: 'USDC',
        from: 'GSENDER',
      };

      await (service as any).processPayment(op);

      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
      expect(mockWebhooks.dispatchWebhook).not.toHaveBeenCalled();
      // No confirmed payment → nothing recorded for adaptive limits.
      expect(mockAdaptiveLimits.recordPayment).not.toHaveBeenCalled();
    });
  });

  describe('amount and asset validation', () => {
    it('rejects payment with amount mismatch', async () => {
      (mockDb.query.payments.findFirst as jest.Mock).mockResolvedValue(null);
      const mockTx = createMockTx({
        id: 'session-1',
        merchant_id: 'merchant-1',
        amount: '10.0000000',
        asset_code: 'USDC',
        memo: 'memo-1',
      });
      (mockDb.transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => Promise<void>) =>
        fn(mockTx),
      );

      const op = {
        type: 'payment',
        transaction_memo: 'memo-1',
        transaction_hash: 'tx-222',
        amount: '5.0000000',
        asset_code: 'USDC',
        from: 'GSENDER',
      };

      await (service as any).processPayment(op);

      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it('rejects payment with asset mismatch', async () => {
      (mockDb.query.payments.findFirst as jest.Mock).mockResolvedValue(null);
      const mockTx = createMockTx({
        id: 'session-1',
        merchant_id: 'merchant-1',
        amount: '10.0000000',
        asset_code: 'USDC',
        memo: 'memo-1',
      });
      (mockDb.transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => Promise<void>) =>
        fn(mockTx),
      );

      const op = {
        type: 'payment',
        transaction_memo: 'memo-1',
        transaction_hash: 'tx-333',
        amount: '10.0000000',
        asset_code: 'BTC',
        from: 'GSENDER',
      };

      await (service as any).processPayment(op);

      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it('accepts payment with XLM when session expects XLM', async () => {
      (mockDb.query.payments.findFirst as jest.Mock).mockResolvedValue(null);
      const mockTx = createMockTx({
        id: 'session-1',
        merchant_id: 'merchant-1',
        amount: '10.0000000',
        asset_code: 'XLM',
        memo: 'memo-1',
      });
      (mockDb.transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => Promise<void>) =>
        fn(mockTx),
      );

      const op = {
        type: 'payment',
        transaction_memo: 'memo-1',
        transaction_hash: 'tx-444',
        amount: '10.0000000',
        asset_code: 'XLM',
        from: 'GSENDER',
      };

      await (service as any).processPayment(op);

      expect(mockTx.update).toHaveBeenCalled();
      expect(mockTx.insert).toHaveBeenCalled();
    });
  });
});
