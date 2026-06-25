import { merchantFixture } from './merchant.fixture';

export const sessionFixture = {
  id: 'cccccccc-0000-4000-8000-cccccccccccc',
  merchantId: merchantFixture.id,
  amount: '10.0000000',
  assetCode: 'USDC',
  assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  receivingAccount: 'GBPLATFORM00000000000000000000000000000000000000000000000',
  memo: 'deadbeef12345678',
  status: 'pending' as const,
  successUrl: 'https://merchant.example.com/success',
  cancelUrl: 'https://merchant.example.com/cancel',
  metadata: { orderId: 'order-123' },
  expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

export const expiredSessionFixture = {
  ...sessionFixture,
  id: 'dddddddd-0000-4000-8000-dddddddddddd',
  status: 'pending' as const,
  expiresAt: new Date(Date.now() - 1000),
};

export const paidSessionFixture = {
  ...sessionFixture,
  id: 'eeeeeeee-0000-4000-8000-eeeeeeeeeeee',
  status: 'paid' as const,
};
