import { validate, configSchema } from './config.schema';

const VALID_BASE: Record<string, unknown> = {
  NODE_ENV: 'development',
  PORT: '3001',
  DATABASE_URL: 'postgresql://postgres:password@localhost:5432/orbitstream',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a-strong-secret-with-at-least-32-chars!!',
  STELLAR_NETWORK: 'testnet',
  STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
  PLATFORM_RECEIVING_ACCOUNT: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
};

describe('configSchema', () => {
  describe('valid config', () => {
    it('accepts a valid development config', () => {
      const result = configSchema.safeParse(VALID_BASE);
      expect(result.success).toBe(true);
    });

    it('applies defaults for missing optional keys', () => {
      const result = configSchema.safeParse(VALID_BASE);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.PORT).toBe(3001);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.FRONTEND_URL).toBe('http://localhost:3000');
      expect(result.data.CHECKOUT_SESSION_TTL_MINUTES).toBe(30);
      expect(result.data.CHALLENGE_TTL_SECONDS).toBe(300);
      expect(result.data.JWT_EXPIRES_IN).toBe('7d');
    });

    it('coerces PORT from string to number', () => {
      const result = configSchema.safeParse({ ...VALID_BASE, PORT: '8080' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.PORT).toBe(8080);
    });

    it('transforms CORS_ALLOWED_ORIGINS into an array', () => {
      const result = configSchema.safeParse({
        ...VALID_BASE,
        CORS_ALLOWED_ORIGINS: 'http://localhost:3000,https://app.example.com',
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.CORS_ALLOWED_ORIGINS).toEqual([
        'http://localhost:3000',
        'https://app.example.com',
      ]);
    });

    it('accepts mainnet network', () => {
      const result = configSchema.safeParse({ ...VALID_BASE, STELLAR_NETWORK: 'mainnet' });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid config', () => {
    it('rejects when DATABASE_URL is missing', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { DATABASE_URL: _url, ...rest } = VALID_BASE;
      const result = configSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects when JWT_SECRET is too short (< 32 chars)', () => {
      const result = configSchema.safeParse({ ...VALID_BASE, JWT_SECRET: 'tooshort' });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues[0].message).toMatch(/32 characters/);
    });

    it('rejects invalid DATABASE_URL', () => {
      const result = configSchema.safeParse({ ...VALID_BASE, DATABASE_URL: 'not-a-url' });
      expect(result.success).toBe(false);
    });

    it('rejects PLATFORM_RECEIVING_ACCOUNT not starting with G', () => {
      const result = configSchema.safeParse({
        ...VALID_BASE,
        PLATFORM_RECEIVING_ACCOUNT: 'XBAD123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown STELLAR_NETWORK value', () => {
      const result = configSchema.safeParse({ ...VALID_BASE, STELLAR_NETWORK: 'devnet' });
      expect(result.success).toBe(false);
    });
  });
});

describe('validate()', () => {
  it('returns parsed config on valid input', () => {
    const config = validate(VALID_BASE);
    expect(config.DATABASE_URL).toBe(VALID_BASE.DATABASE_URL);
    expect(config.PORT).toBe(3001);
  });

  it('throws with a descriptive message on invalid input', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { DATABASE_URL: _db, JWT_SECRET: _jwt, ...rest } = VALID_BASE;
    expect(() => validate(rest)).toThrow('Config validation failed');
  });

  it('throws in production when defaultable keys are missing from raw env', () => {
    expect(() =>
      validate({
        ...VALID_BASE,
        NODE_ENV: 'production',
        // PORT, FRONTEND_URL etc. absent — only defaults would fill them
      }),
    ).toThrow(/Production requires/);
  });

  it('passes in production when all defaultable keys are explicitly provided', () => {
    const prodEnv = {
      ...VALID_BASE,
      NODE_ENV: 'production',
      PORT: '443',
      JWT_EXPIRES_IN: '1d',
      FRONTEND_URL: 'https://app.example.com',
      CHECKOUT_SESSION_TTL_MINUTES: '30',
      CHALLENGE_TTL_SECONDS: '300',
      REDIS_CURSOR_TTL_HOURS: '24',
      WEBHOOK_POLL_MS: '250',
      WEBHOOK_MAX_CONCURRENCY: '100',
      PLATFORM_DOMAIN: 'https://api.example.com',
      CORS_ALLOWED_ORIGINS: 'https://app.example.com',
    };
    expect(() => validate(prodEnv)).not.toThrow();
  });
});
