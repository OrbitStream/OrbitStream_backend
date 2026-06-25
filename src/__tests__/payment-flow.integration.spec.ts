/**
 * Payment flow integration test.
 *
 * Exercises the full path from a Horizon payment fixture through
 * PaymentDetectorService.processPayment(), verifying that the session
 * transitions to 'paid' and a webhook is dispatched.
 *
 * Uses `createPaymentsPageWithPayment` to build the Horizon fixture and
 * then maps it to the flat op shape that processPayment expects.
 */
jest.mock('../db/index', () => ({
  db: { transaction: jest.fn() },
  client: {},
}));

import { ConfigService } from '@nestjs/config';
import { PaymentDetectorService } from '../payments/payment-detector.service';
import { PaymentCursorService } from '../payments/payment-cursor.service';
import { StellarService } from '../stellar/stellar.service';
import { WebhookService } from '../webhook/webhook.service';
import { MetricsService } from '../monitoring/metrics.service';
import { db } from '../db/index';
import {
  createStellarServiceMock,
  createPaymentsPageWithPayment,
  mockHorizonPayment,
} from './helpers/stellar.mock';

const mockDb = db as jest.Mocked<typeof db>;

const SESSION_ID = 'sess-pay-flow-001';
const MERCHANT_ID = 'merchant-pay-flow-001';
const SESSION_MEMO = mockHorizonPayment.transaction.memo;
const SESSION_AMOUNT = mockHorizonPayment.amount;
const SESSION_ASSET = mockHorizonPayment.asset_code;

/** Build a processPayment op from a Horizon fixture record. */
function opFromFixture(overrides: Partial<typeof mockHorizonPayment> = {}) {
  const record = createPaymentsPageWithPayment(overrides).records[0];
  return {
    ...record,
    // Horizon embeds memo on transaction; processPayment reads transaction_memo.
    transaction_memo: record.transaction?.memo,
  };
}

function makeClaimTx(session: Record<string, unknown>) {
  const returningMock = jest.fn().mockResolvedValue([{ id: session['id'] }]);
  const setMock = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({ returning: returningMock }),
  });
  const updateMock = jest.fn().mockReturnValue({ set: setMock });
  const tx = {
    execute: jest.fn().mockResolvedValue([session]),
    query: { payments: { findFirst: jest.fn().mockResolvedValue(null) } },
    update: updateMock,
  };
  return { tx, setMock };
}

function makeFinalizeTx() {
  const onConflictDoNothingMock = jest.fn().mockResolvedValue(undefined);
  const valuesMock = jest.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });
  const insertMock = jest.fn().mockReturnValue({ values: valuesMock });
  const updateWhereMock = jest.fn().mockResolvedValue(undefined);
  const setMock = jest.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = jest.fn().mockReturnValue({ set: setMock });
  return { tx: { insert: insertMock, update: updateMock }, setMock };
}

describe('Payment flow integration', () => {
  let service: PaymentDetectorService;
  let mockWebhooks: jest.Mocked<WebhookService>;
  let mockMetrics: jest.Mocked<MetricsService>;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockStellar: jest.Mocked<StellarService> = createStellarServiceMock();
    mockWebhooks = { dispatchWebhook: jest.fn() } as any;
    mockMetrics = { paymentsConfirmed: { inc: jest.fn() } } as any;
    const mockCursorService = {
      restoreCursor: jest.fn(),
      updateCursor: jest.fn(),
      appendCheckpoint: jest.fn(),
      acquireLock: jest.fn(),
      renewLock: jest.fn(),
      releaseLock: jest.fn(),
    } as unknown as jest.Mocked<PaymentCursorService>;
    const mockConfig = { get: () => undefined } as unknown as ConfigService;

    service = new PaymentDetectorService(
      mockStellar,
      mockWebhooks,
      mockMetrics,
      mockCursorService,
      mockConfig,
    );
  });

  it('marks session paid and dispatches webhook when payment matches memo, amount, and asset', async () => {
    const session = {
      id: SESSION_ID,
      merchant_id: MERCHANT_ID,
      amount: SESSION_AMOUNT,
      asset_code: SESSION_ASSET,
      memo: SESSION_MEMO,
      status: 'pending',
    };
    const claim = makeClaimTx(session);
    const finalize = makeFinalizeTx();

    (mockDb.transaction as jest.Mock)
      .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(claim.tx))
      .mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => fn(finalize.tx));

    await (service as any).processPayment(opFromFixture());

    expect(claim.setMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'processing' }));
    expect(finalize.setMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid' }));
    expect(mockMetrics.paymentsConfirmed.inc).toHaveBeenCalledTimes(1);
    expect(mockWebhooks.dispatchWebhook).toHaveBeenCalledWith(
      MERCHANT_ID,
      'payment.confirmed',
      expect.objectContaining({ sessionId: SESSION_ID }),
    );
  });

  it('does not dispatch webhook when payment amount does not match', async () => {
    const session = {
      id: SESSION_ID,
      merchant_id: MERCHANT_ID,
      amount: '999.0000000',
      asset_code: SESSION_ASSET,
      memo: SESSION_MEMO,
      status: 'pending',
    };
    const claim = makeClaimTx(session);

    (mockDb.transaction as jest.Mock).mockImplementationOnce(
      async (fn: (tx: any) => Promise<any>) => fn(claim.tx),
    );

    await (service as any).processPayment(opFromFixture());

    expect(mockMetrics.paymentsConfirmed.inc).not.toHaveBeenCalled();
    expect(mockWebhooks.dispatchWebhook).not.toHaveBeenCalled();
  });

  it('silently skips operations that are not type "payment"', async () => {
    await (service as any).processPayment({
      type: 'create_account',
      transaction_memo: SESSION_MEMO,
    });

    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockWebhooks.dispatchWebhook).not.toHaveBeenCalled();
  });
});
