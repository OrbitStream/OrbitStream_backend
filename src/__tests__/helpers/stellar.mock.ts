import { StellarService, PaymentsPage } from '../../stellar/stellar.service';

export const mockAccountInfo = {
  id: 'GBTEST1234567890123456789012345678901234567890123456789',
  sequence: '123456789',
  balances: [
    { asset_type: 'native', balance: '100.0000000' },
    {
      asset_type: 'credit_alphanum4',
      asset_code: 'USDC',
      asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      balance: '500.0000000',
    },
  ],
};

export const mockHorizonPayment = {
  id: 'op-1',
  type: 'payment',
  transaction_hash: 'txhash-abc123',
  from: 'GBBUYER000000000000000000000000000000000000000000000000',
  to: 'GBTEST1234567890123456789012345678901234567890123456789',
  asset_type: 'credit_alphanum4',
  asset_code: 'USDC',
  asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  amount: '10.0000000',
  transaction: {
    memo: 'test-memo-0001',
    memo_type: 'text',
    successful: true,
  },
};

export function createStellarServiceMock(
  overrides: Partial<Record<keyof StellarService, jest.Mock>> = {},
): jest.Mocked<StellarService> {
  const defaultPage: PaymentsPage = {
    records: [],
    rateLimitLimit: 100,
    rateLimitRemaining: 90,
    httpStatus: 200,
  };

  return {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    getAccountInfo: jest.fn().mockResolvedValue(mockAccountInfo),
    getBalance: jest.fn().mockResolvedValue(100.0),
    verifyTransaction: jest.fn().mockResolvedValue(true),
    getTransactionOperations: jest.fn().mockResolvedValue([]),
    getPaymentsForAccount: jest.fn().mockResolvedValue([]),
    getPaymentsPage: jest.fn().mockResolvedValue(defaultPage),
    ...overrides,
  } as any;
}

/** Returns a PaymentsPage fixture with a single matching payment. */
export function createPaymentsPageWithPayment(
  overrides: Partial<typeof mockHorizonPayment> = {},
): PaymentsPage {
  return {
    records: [{ ...mockHorizonPayment, ...overrides }],
    rateLimitLimit: 100,
    rateLimitRemaining: 90,
    httpStatus: 200,
  };
}
