import { PaymentRecoveryService } from '../payments/payment-recovery.service';
import { WebhookService } from '../webhook/webhook.service';
import { StellarService } from '../stellar/stellar.service';
import { db } from '../db/index';

jest.mock('../db/index', () => ({
  db: {
    query: {
      payments: { findFirst: jest.fn() },
    },
    execute: jest.fn(),
    update: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

const createMockUpdateChain = () => {
  const where = jest.fn().mockResolvedValue(undefined);
  const set = jest.fn().mockReturnValue({ where });
  return { set, where };
};

const createMockTx = () => ({
  insert: jest.fn().mockReturnValue({
    values: jest.fn().mockReturnValue({
      onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    }),
  }),
  update: jest.fn().mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  }),
});

describe('PaymentRecoveryService', () => {
  let service: PaymentRecoveryService;
  let mockWebhooks: jest.Mocked<WebhookService>;
  let mockStellar: jest.Mocked<StellarService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWebhooks = {
      dispatchWebhook: jest.fn(),
    } as any;

    mockStellar = {
      getPaymentsForAccount: jest.fn().mockResolvedValue([]),
      verifyTransaction: jest.fn().mockResolvedValue(false),
    } as any;

    service = new PaymentRecoveryService(mockWebhooks, mockStellar);
  });

  describe('recoverStuckProcessing', () => {
    const stuckRow = {
      id: 'session-stuck',
      merchant_id: 'merchant-1',
      memo: 'memo-stuck',
      amount: '10.0000000',
      asset_code: 'USDC',
      asset_issuer: null,
      receiving_account: 'GPLATFORM',
    };

    it('does nothing when no sessions are stuck in processing', async () => {
      (mockDb.execute as jest.Mock).mockResolvedValueOnce([]);

      await (service as any).recoverStuckProcessing();

      expect(mockStellar.getPaymentsForAccount).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('completes the payment when Horizon confirms a matching transaction', async () => {
      (mockDb.execute as jest.Mock).mockResolvedValueOnce([stuckRow]);
      (mockStellar.getPaymentsForAccount as jest.Mock).mockResolvedValue([
        {
          type: 'payment',
          transaction_memo: 'memo-stuck',
          transaction_hash: 'tx-recovered',
          amount: '10.0000000',
          asset_code: 'USDC',
          from: 'GSENDER',
        },
      ]);
      (mockStellar.verifyTransaction as jest.Mock).mockResolvedValue(true);

      const mockTx = createMockTx();
      (mockDb.transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => Promise<void>) =>
        fn(mockTx),
      );

      await (service as any).recoverStuckProcessing();

      expect(mockStellar.verifyTransaction).toHaveBeenCalledWith('tx-recovered');
      expect(mockTx.insert).toHaveBeenCalledTimes(1);
      expect(mockTx.update).toHaveBeenCalledTimes(1);
      expect(mockWebhooks.dispatchWebhook).toHaveBeenCalledWith(
        'merchant-1',
        'payment.confirmed',
        expect.objectContaining({ sessionId: 'session-stuck', txHash: 'tx-recovered' }),
      );
    });

    it('reverts to pending when no matching payment is found on Horizon', async () => {
      (mockDb.execute as jest.Mock).mockResolvedValueOnce([stuckRow]);
      (mockStellar.getPaymentsForAccount as jest.Mock).mockResolvedValue([]);

      const chain = createMockUpdateChain();
      (mockDb.update as jest.Mock).mockReturnValue({ set: chain.set });

      await (service as any).recoverStuckProcessing();

      expect(mockDb.transaction).not.toHaveBeenCalled();
      expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    });

    it('reverts to pending when the matching transaction did not actually confirm', async () => {
      (mockDb.execute as jest.Mock).mockResolvedValueOnce([stuckRow]);
      (mockStellar.getPaymentsForAccount as jest.Mock).mockResolvedValue([
        {
          type: 'payment',
          transaction_memo: 'memo-stuck',
          transaction_hash: 'tx-failed',
          amount: '10.0000000',
          asset_code: 'USDC',
          from: 'GSENDER',
        },
      ]);
      (mockStellar.verifyTransaction as jest.Mock).mockResolvedValue(false);

      const chain = createMockUpdateChain();
      (mockDb.update as jest.Mock).mockReturnValue({ set: chain.set });

      await (service as any).recoverStuckProcessing();

      expect(mockDb.transaction).not.toHaveBeenCalled();
      expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    });

    it('reverts to pending without calling Horizon when the session has no memo', async () => {
      (mockDb.execute as jest.Mock).mockResolvedValueOnce([{ ...stuckRow, memo: null }]);

      const chain = createMockUpdateChain();
      (mockDb.update as jest.Mock).mockReturnValue({ set: chain.set });

      await (service as any).recoverStuckProcessing();

      expect(mockStellar.getPaymentsForAccount).not.toHaveBeenCalled();
      expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    });

    it('continues reconciling remaining sessions if one fails', async () => {
      (mockDb.execute as jest.Mock).mockResolvedValueOnce([
        { ...stuckRow, id: 'session-a' },
        { ...stuckRow, id: 'session-b' },
      ]);
      (mockStellar.getPaymentsForAccount as jest.Mock)
        .mockRejectedValueOnce(new Error('Horizon down'))
        .mockResolvedValueOnce([]);

      const chain = createMockUpdateChain();
      (mockDb.update as jest.Mock).mockReturnValue({ set: chain.set });

      await (service as any).recoverStuckProcessing();

      expect(chain.set).toHaveBeenCalledTimes(1);
      expect(chain.where).toHaveBeenCalled();
    });
  });

  describe('recoverPendingWithPayments', () => {
    it('marks pending sessions with existing payments as paid', async () => {
      (mockDb.execute as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'session-1',
            merchant_id: 'merchant-1',
            tx_hash: 'tx-123',
            amount: '10.0000000',
            asset_code: 'USDC',
            sender_address: 'GSENDER',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const chain = createMockUpdateChain();
      mockDb.update.mockReturnValue({ set: chain.set } as any);

      await service.recoverStaleSessions();

      expect(chain.set).toHaveBeenCalledTimes(1);
      expect(mockWebhooks.dispatchWebhook).toHaveBeenCalledWith(
        'merchant-1',
        'payment.confirmed',
        expect.objectContaining({ sessionId: 'session-1' }),
      );
    });

    it('handles multiple pending sessions', async () => {
      (mockDb.execute as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'session-1',
            merchant_id: 'm1',
            tx_hash: 'tx-1',
            amount: '10',
            asset_code: 'USDC',
            sender_address: 'G1',
          },
          {
            id: 'session-2',
            merchant_id: 'm2',
            tx_hash: 'tx-2',
            amount: '20',
            asset_code: 'XLM',
            sender_address: 'G2',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const chain = createMockUpdateChain();
      mockDb.update.mockReturnValue({ set: chain.set } as any);

      await service.recoverStaleSessions();

      expect(chain.set).toHaveBeenCalledTimes(2);
      expect(mockWebhooks.dispatchWebhook).toHaveBeenCalledTimes(2);
    });

    it('continues if one session recovery fails', async () => {
      (mockDb.execute as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'session-1',
            merchant_id: 'm1',
            tx_hash: 'tx-1',
            amount: '10',
            asset_code: 'USDC',
            sender_address: 'G1',
          },
          {
            id: 'session-2',
            merchant_id: 'm2',
            tx_hash: 'tx-2',
            amount: '20',
            asset_code: 'XLM',
            sender_address: 'G2',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      let callCount = 0;
      const chain = createMockUpdateChain();
      chain.where.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve(undefined);
      });
      mockDb.update.mockReturnValue({ set: chain.set } as any);

      await service.recoverStaleSessions();

      expect(chain.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('recoverStuckPending', () => {
    it('marks stale pending sessions without payments as expired', async () => {
      (mockDb.execute as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'stale-session', memo: 'memo-1' }])
        .mockResolvedValueOnce([]);

      (mockDb.query.payments.findFirst as jest.Mock).mockResolvedValue(null);
      const chain = createMockUpdateChain();
      mockDb.update.mockReturnValue({ set: chain.set } as any);

      await service.recoverStaleSessions();

      expect(chain.set).toHaveBeenCalled();
    });

    it('marks stale pending sessions with payments as paid', async () => {
      (mockDb.execute as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'stale-session', memo: 'memo-1' }])
        .mockResolvedValueOnce([]);

      (mockDb.query.payments.findFirst as jest.Mock).mockResolvedValue({ id: 'payment-1' });
      const chain = createMockUpdateChain();
      mockDb.update.mockReturnValue({ set: chain.set } as any);

      await service.recoverStaleSessions();

      expect(chain.set).toHaveBeenCalled();
    });
  });

  describe('orchestration', () => {
    it('runs all four recovery scenarios in order', async () => {
      (mockDb.execute as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.recoverStaleSessions();

      expect(mockDb.execute).toHaveBeenCalledTimes(4);
    });
  });

  describe('empty results', () => {
    it('does nothing when no sessions need recovery', async () => {
      (mockDb.execute as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.recoverStaleSessions();

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockWebhooks.dispatchWebhook).not.toHaveBeenCalled();
    });
  });
});
