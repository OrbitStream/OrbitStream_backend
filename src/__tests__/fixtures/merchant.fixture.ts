export const merchantFixture = {
  id: 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
  walletAddress: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  businessName: 'Test Merchant',
  email: 'merchant@example.com',
  role: 'merchant' as const,
  webhookUrl: 'https://merchant.example.com/webhook',
  webhookSecret: 'whsec_test1234567890',
  logoUrl: null,
  corsOrigins: [],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

export const apiKeyFixture = {
  id: 'bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb',
  merchantId: merchantFixture.id,
  keyPrefix: 'sk_test_abc...',
  keyHash: 'hash123',
  environment: 'testnet' as const,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};
