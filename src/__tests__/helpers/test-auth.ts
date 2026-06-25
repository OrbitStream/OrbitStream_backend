import * as crypto from 'crypto';

const TEST_JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-with-at-least-32-characters';

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * Creates a minimal HS256 JWT for a given merchantId. Suitable for testing
 * endpoints that require a valid Bearer token.
 */
export function getAuthToken(merchantId: string, ttlSeconds = 3600): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      sub: merchantId,
      merchantId,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
      iat: Math.floor(Date.now() / 1000),
    }),
  );
  const sig = crypto
    .createHmac('sha256', TEST_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

/**
 * Returns a Bearer authorization header for the given merchantId.
 */
export function bearerHeader(merchantId: string): { Authorization: string } {
  return { Authorization: `Bearer ${getAuthToken(merchantId)}` };
}

/**
 * Generates a realistic API key string (not hashed) for testing.
 * Format matches the `sk_test_` prefix used by MerchantsService.
 */
export function getApiKey(environment: 'testnet' | 'mainnet' = 'testnet'): string {
  const prefix = environment === 'testnet' ? 'sk_test_' : 'sk_live_';
  return prefix + crypto.randomBytes(24).toString('hex');
}

export function apiKeyHeader(key: string): { Authorization: string } {
  return { Authorization: `Bearer ${key}` };
}
