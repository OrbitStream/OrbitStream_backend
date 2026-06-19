import type { Request } from 'express';
import { isExempt, resolveRule, clientIp, apiKey, rateLimitIdentity } from './rate-limit.config';

describe('isExempt', () => {
  it.each(['/health', '/metrics', '/health/db', '/metrics/'])('exempts %s', (path) => {
    expect(isExempt(path)).toBe(true);
  });

  it.each(['/auth/login', '/v1/checkout/sessions', '/healthz', '/metricsfoo'])(
    'does not exempt %s',
    (path) => {
      expect(isExempt(path)).toBe(false);
    },
  );
});

describe('resolveRule', () => {
  it('limits /auth/login and /auth/verify to 5/min per IP', () => {
    expect(resolveRule('POST', '/auth/login')).toMatchObject({ limit: 5, scope: 'ip' });
    expect(resolveRule('POST', '/auth/verify')).toMatchObject({ limit: 5, scope: 'ip' });
  });

  it('limits /merchants/register to 3/min per IP', () => {
    expect(resolveRule('POST', '/merchants/register')).toMatchObject({ limit: 3, scope: 'ip' });
  });

  it('limits POST /v1/checkout/sessions to 100/min per API key', () => {
    expect(resolveRule('POST', '/v1/checkout/sessions')).toMatchObject({
      limit: 100,
      scope: 'apiKey',
    });
  });

  it('limits GET /v1/checkout/sessions/:id to 60/min per IP', () => {
    expect(resolveRule('GET', '/v1/checkout/sessions/abc')).toMatchObject({
      limit: 60,
      scope: 'ip',
    });
  });

  it('falls back to 60/min per IP for everything else', () => {
    expect(resolveRule('GET', '/merchants/me')).toMatchObject({ limit: 60, scope: 'ip' });
    expect(resolveRule('POST', '/auth/challenge')).toMatchObject({ limit: 60, scope: 'ip' });
  });
});

function req(headers: Record<string, string | string[]>, ip?: string): Request {
  return { headers, ip, socket: { remoteAddress: ip } } as unknown as Request;
}

describe('clientIp', () => {
  it('prefers the first X-Forwarded-For hop', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('falls back to req.ip', () => {
    expect(clientIp(req({}, '9.9.9.9'))).toBe('9.9.9.9');
  });
});

describe('apiKey', () => {
  it('extracts the bearer token', () => {
    expect(apiKey(req({ authorization: 'Bearer sk_test_abc' }))).toBe('sk_test_abc');
  });

  it('returns undefined without a bearer token', () => {
    expect(apiKey(req({}))).toBeUndefined();
  });
});

describe('rateLimitIdentity', () => {
  it('keys api-key-scoped rules by the api key', () => {
    const id = rateLimitIdentity(req({ authorization: 'Bearer sk_test_abc' }), {
      name: 'checkout-create',
      limit: 100,
      scope: 'apiKey',
    });
    expect(id).toBe('key:sk_test_abc');
  });

  it('falls back to IP when an api-key-scoped rule has no key', () => {
    const id = rateLimitIdentity(req({}, '1.1.1.1'), {
      name: 'checkout-create',
      limit: 100,
      scope: 'apiKey',
    });
    expect(id).toBe('ip:1.1.1.1');
  });

  it('keys ip-scoped rules by IP', () => {
    const id = rateLimitIdentity(req({ 'x-forwarded-for': '2.2.2.2' }), {
      name: 'auth',
      limit: 5,
      scope: 'ip',
    });
    expect(id).toBe('ip:2.2.2.2');
  });
});
