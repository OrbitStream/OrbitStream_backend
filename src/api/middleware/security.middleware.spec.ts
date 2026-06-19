import type { Request, Response } from 'express';
import { createSecurityMiddleware } from './security.middleware';

function mockRes(): { res: Response; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    setHeader: (name: string, value: unknown) => {
      headers[name] = String(value);
      return res;
    },
    getHeader: (name: string) => headers[name],
    end: jest.fn(),
  };
  return { res: res as Response, headers };
}

function mockReq(method: string, path: string, origin?: string): Request {
  return {
    method,
    path,
    headers: origin ? { origin } : {},
  } as unknown as Request;
}

const PROD_ENV = {
  NODE_ENV: 'production',
  CORS_ALLOWED_ORIGINS: 'https://app.orbit.com,https://dash.orbit.com',
} as NodeJS.ProcessEnv;

describe('securityMiddleware', () => {
  it('always sets the baseline security headers', () => {
    const mw = createSecurityMiddleware(PROD_ENV);
    const { res, headers } = mockRes();
    const next = jest.fn();
    mw(mockReq('GET', '/merchants/me'), res, next);

    expect(headers['Strict-Transport-Security']).toMatch(/max-age=/);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(next).toHaveBeenCalled();
  });

  it('echoes a valid origin (never *)', () => {
    const mw = createSecurityMiddleware(PROD_ENV);
    const { res, headers } = mockRes();
    const next = jest.fn();
    mw(mockReq('GET', '/merchants/me', 'https://app.orbit.com'), res, next);

    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.orbit.com');
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, PATCH, DELETE, OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toBe(
      'Content-Type, Authorization, X-Request-Id',
    );
    expect(headers['Access-Control-Max-Age']).toBe('86400');
    expect(next).toHaveBeenCalled();
  });

  it('does not set allow-origin for a disallowed origin', () => {
    const mw = createSecurityMiddleware(PROD_ENV);
    const { res, headers } = mockRes();
    const next = jest.fn();
    mw(mockReq('GET', '/merchants/me', 'https://evil.com'), res, next);

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('handles preflight OPTIONS with 204 and ends the response', () => {
    const mw = createSecurityMiddleware(PROD_ENV);
    const { res, headers } = mockRes();
    const next = jest.fn();
    mw(mockReq('OPTIONS', '/merchants/me', 'https://app.orbit.com'), res, next);

    expect(res.statusCode).toBe(204);
    expect((res as unknown as { end: jest.Mock }).end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.orbit.com');
  });

  it('allows any origin on the public checkout-status route', () => {
    const mw = createSecurityMiddleware(PROD_ENV);
    const { res, headers } = mockRes();
    const next = jest.fn();
    mw(mockReq('GET', '/v1/checkout/sessions/sess-1', 'https://random-merchant.com'), res, next);

    expect(headers['Access-Control-Allow-Origin']).toBe('https://random-merchant.com');
    expect(next).toHaveBeenCalled();
  });

  it('uses * for the public route when no origin header is present', () => {
    const mw = createSecurityMiddleware(PROD_ENV);
    const { res, headers } = mockRes();
    const next = jest.fn();
    mw(mockReq('GET', '/v1/checkout/sessions/sess-1'), res, next);

    expect(headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
