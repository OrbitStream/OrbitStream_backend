import { PaymentRecoveryService } from '../payments/payment-recovery.service';
import { WebhookService } from '../webhook/webhook.service';
import { db } from '../db/index';

jest.mock('../db/index', () => ({
  db: {
    query: {
      payments: { findFirst: jest.fn() },
    },
    execute: jest.fn(),
    update: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

const createMockUpdateChain = () => {
  const where = jest.fn().mockResolvedValue(undefined);
  const set = jest.fn().mockReturnValue({ where });
  return { set, where };
};

describe('PaymentRecoveryService', () => {
  let service: PaymentRecoveryService;
  let mockWebhooks: jest.Mocked<WebhookService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWebhooks = {
      dispatchWebhook: jest.fn(),
    } as any;

    service = new PaymentRecoveryService(mockWebhooks);
  });

  describe('recoverPendingWithPayments', () => {
    it('marks pending sessions with existing payments as paid', async () => {
      (mockDb.execute as jest.Mock)
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
        .mockResolvedValueOnce([{ id: 'stale-session', memo: 'memo-1' }])
        .mockResolvedValueOnce([]);

      (mockDb.query.payments.findFirst as jest.Mock).mockResolvedValue({ id: 'payment-1' });
      const chain = createMockUpdateChain();
      mockDb.update.mockReturnValue({ set: chain.set } as any);

      await service.recoverStaleSessions();

      expect(chain.set).toHaveBeenCalled();
    });
  });

  describe('empty results', () => {
    it('does nothing when no sessions need recovery', async () => {
      (mockDb.execute as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.recoverStaleSessions();

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockWebhooks.dispatchWebhook).not.toHaveBeenCalled();
    });
  });
});
