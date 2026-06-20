import { readFileSync } from 'fs';
import { resolve } from 'path';

const REQUIRED_ENV_KEYS = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'STELLAR_NETWORK',
  'STELLAR_HORIZON_URL',
  'STELLAR_NETWORK_PASSPHRASE',
  'PLATFORM_RECEIVING_ACCOUNT',
  'FRONTEND_URL',
];

const OPTIONAL_ENV_KEYS = [
  'CHECKOUT_SESSION_TTL_MINUTES',
  'CHALLENGE_TTL_SECONDS',
  'CORS_ALLOWED_ORIGINS',
];

function parseEnvExample(): Map<string, string> {
  const envExample = readFileSync(resolve(__dirname, '../../.env.example'), 'utf8');

  return new Map(
    envExample
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

describe('.env.example', () => {
  const values = parseEnvExample();

  it('documents all required configuration keys', () => {
    for (const key of REQUIRED_ENV_KEYS) {
      expect(values.has(key)).toBe(true);
    }
  });

  it('documents expected optional configuration keys', () => {
    for (const key of OPTIONAL_ENV_KEYS) {
      expect(values.has(key)).toBe(true);
    }
  });

  it('uses a JWT placeholder that satisfies the minimum length requirement', () => {
    expect(values.get('JWT_SECRET')?.length).toBeGreaterThanOrEqual(32);
  });
});
