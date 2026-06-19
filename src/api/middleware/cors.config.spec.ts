import { isPublicCorsRoute, resolveAllowedOrigins } from './cors.config';

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe('resolveAllowedOrigins', () => {
  it('defaults to localhost:3000 in development', () => {
    expect(resolveAllowedOrigins(env({ NODE_ENV: 'development' }))).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('parses a comma-separated list and trims whitespace', () => {
    expect(
      resolveAllowedOrigins(
        env({ CORS_ALLOWED_ORIGINS: 'https://a.com, https://b.com ,https://c.com' }),
      ),
    ).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
  });

  it('throws in production when CORS_ALLOWED_ORIGINS is unset', () => {
    expect(() => resolveAllowedOrigins(env({ NODE_ENV: 'production' }))).toThrow(
      /CORS_ALLOWED_ORIGINS must be set in production/,
    );
  });

  it('throws in production when CORS_ALLOWED_ORIGINS is empty/whitespace', () => {
    expect(() =>
      resolveAllowedOrigins(env({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: ' , ' })),
    ).toThrow(/CORS_ALLOWED_ORIGINS must be set in production/);
  });

  it('uses the configured origins in production', () => {
    expect(
      resolveAllowedOrigins(
        env({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://app.orbit.com' }),
      ),
    ).toEqual(['https://app.orbit.com']);
  });
});

describe('isPublicCorsRoute', () => {
  it('matches GET /v1/checkout/sessions/:id', () => {
    expect(isPublicCorsRoute('GET', '/v1/checkout/sessions/abc-123')).toBe(true);
    expect(isPublicCorsRoute('get', '/v1/checkout/sessions/abc-123/')).toBe(true);
  });

  it('does not match the collection route or non-GET methods', () => {
    expect(isPublicCorsRoute('GET', '/v1/checkout/sessions')).toBe(false);
    expect(isPublicCorsRoute('POST', '/v1/checkout/sessions/abc-123')).toBe(false);
    expect(isPublicCorsRoute('GET', '/v1/checkout/sessions/abc/cancel')).toBe(false);
  });

  it('does not match unrelated routes', () => {
    expect(isPublicCorsRoute('GET', '/merchants/me')).toBe(false);
  });
});
