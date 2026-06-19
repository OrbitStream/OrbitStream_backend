import {
  resolveJwtSecrets,
  jwtExpiresIn,
  MIN_JWT_SECRET_LENGTH,
  INSECURE_JWT_SECRETS,
} from './jwt-secret.config';

const STRONG = 'a'.repeat(MIN_JWT_SECRET_LENGTH); // 32 chars
const STRONG_2 = 'b'.repeat(MIN_JWT_SECRET_LENGTH);

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe('resolveJwtSecrets', () => {
  describe('production hardening', () => {
    it('throws when JWT_SECRET is missing in production', () => {
      expect(() => resolveJwtSecrets(env({ NODE_ENV: 'production' }))).toThrow(
        /JWT_SECRET is not set/,
      );
    });

    it('throws when JWT_SECRET is empty in production', () => {
      expect(() => resolveJwtSecrets(env({ NODE_ENV: 'production', JWT_SECRET: '' }))).toThrow(
        /JWT_SECRET is not set/,
      );
    });

    it.each(INSECURE_JWT_SECRETS)(
      'throws when JWT_SECRET is the insecure placeholder "%s" in production',
      (placeholder) => {
        expect(() =>
          resolveJwtSecrets(env({ NODE_ENV: 'production', JWT_SECRET: placeholder })),
        ).toThrow(/insecure placeholder/);
      },
    );

    it('throws when JWT_SECRET is shorter than the minimum length', () => {
      expect(() =>
        resolveJwtSecrets(env({ NODE_ENV: 'production', JWT_SECRET: 'short-secret' })),
      ).toThrow(new RegExp(`at least ${MIN_JWT_SECRET_LENGTH} characters`));
    });

    it('accepts a strong secret in production', () => {
      expect(resolveJwtSecrets(env({ NODE_ENV: 'production', JWT_SECRET: STRONG }))).toEqual({
        current: STRONG,
      });
    });

    it('throws when JWT_SECRET_PREVIOUS is too short in production', () => {
      expect(() =>
        resolveJwtSecrets(
          env({ NODE_ENV: 'production', JWT_SECRET: STRONG, JWT_SECRET_PREVIOUS: 'tooshort' }),
        ),
      ).toThrow(/JWT_SECRET_PREVIOUS must be at least/);
    });

    it('returns current + previous when both are strong', () => {
      expect(
        resolveJwtSecrets(
          env({ NODE_ENV: 'production', JWT_SECRET: STRONG, JWT_SECRET_PREVIOUS: STRONG_2 }),
        ),
      ).toEqual({ current: STRONG, previous: STRONG_2 });
    });
  });

  describe('length validation in all environments', () => {
    it('throws for a too-short secret even in development', () => {
      expect(() =>
        resolveJwtSecrets(env({ NODE_ENV: 'development', JWT_SECRET: 'short' })),
      ).toThrow(new RegExp(`at least ${MIN_JWT_SECRET_LENGTH} characters`));
    });
  });

  describe('development convenience', () => {
    it('falls back to dev-secret when unset in development', () => {
      expect(resolveJwtSecrets(env({ NODE_ENV: 'development' }))).toEqual({
        current: 'dev-secret',
      });
    });

    it('allows the placeholder secret in development', () => {
      expect(resolveJwtSecrets(env({ NODE_ENV: 'development', JWT_SECRET: 'dev-secret' }))).toEqual(
        {
          current: 'dev-secret',
        },
      );
    });
  });
});

describe('jwtExpiresIn', () => {
  it('defaults to 7d', () => {
    expect(jwtExpiresIn(env({}))).toBe('7d');
  });

  it('honours JWT_EXPIRES_IN', () => {
    expect(jwtExpiresIn(env({ JWT_EXPIRES_IN: '1h' }))).toBe('1h');
  });
});
