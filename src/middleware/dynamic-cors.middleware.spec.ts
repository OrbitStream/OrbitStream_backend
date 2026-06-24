import { ConfigService } from '@nestjs/config';
import { DynamicCorsMiddleware } from './dynamic-cors.middleware';
import { CorsOriginsCacheService } from './cors-origins-cache.service';

function mockReqRes(path: string, method: string, origin?: string) {
  const headers: Record<string, string> = {};
  if (origin) headers['origin'] = origin;
  const req = { path, method, headers } as any;
  const res = {
    _headers: {} as Record<string, string>,
    _status: 200,
    _body: null,
    setHeader(k: string, v: string) {
      this._headers[k] = v;
    },
    status(s: number) {
      this._status = s;
      return this;
    },
    json(b: any) {
      this._body = b;
      return this;
    },
    end() {
      return this;
    },
  } as any;
  const next = jest.fn();
  return { req, res, next };
}

describe('DynamicCorsMiddleware - route grouping', () => {
  let middleware: DynamicCorsMiddleware;
  let cache: jest.Mocked<CorsOriginsCacheService>;

  beforeEach(() => {
    cache = {
      getAllMerchantOrigins: jest.fn().mockResolvedValue(['https://myshop.com']),
      getMerchantOrigins: jest.fn().mockResolvedValue([] as string[]),
      invalidateMerchantCache: jest.fn(),
      refreshCache: jest.fn(),
      invalidateAllCache: jest.fn(),
    } as any;
    const mockConfig = {
      get: (key: string) => (key === 'PLATFORM_DOMAIN' ? 'http://localhost:3001' : undefined),
    } as unknown as ConfigService;
    middleware = new DynamicCorsMiddleware(cache, mockConfig);
  });

  it('allows all origins on public GET /v1/checkout/sessions/:id', async () => {
    const { req, res, next } = mockReqRes(
      '/v1/checkout/sessions/abc-123',
      'GET',
      'https://evil.com',
    );
    await middleware.use(req, res, next);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('https://evil.com');
    expect(next).toHaveBeenCalled();
  });

  it('allows all origins on POST /merchants/register', async () => {
    const { req, res, next } = mockReqRes('/merchants/register', 'POST', 'https://evil.com');
    await middleware.use(req, res, next);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('https://evil.com');
    expect(next).toHaveBeenCalled();
  });

  it('allows all origins on /health', async () => {
    const { req, res, next } = mockReqRes('/health', 'GET', 'https://evil.com');
    await middleware.use(req, res, next);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('https://evil.com');
    expect(next).toHaveBeenCalled();
  });

  it('blocks unknown origins on merchant API routes', async () => {
    cache.getAllMerchantOrigins.mockResolvedValue(['https://myshop.com']);
    const { req, res, next } = mockReqRes('/v1/checkout/sessions', 'POST', 'https://evil.com');
    await middleware.use(req, res, next);
    expect(res._status).toBe(403);
    expect(res._body).toEqual({ error: 'CORS_ORIGIN_DENIED', message: 'Origin not allowed' });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows configured merchant origins on merchant API routes', async () => {
    cache.getAllMerchantOrigins.mockResolvedValue(['https://myshop.com']);
    const { req, res, next } = mockReqRes('/v1/checkout/sessions', 'POST', 'https://myshop.com');
    await middleware.use(req, res, next);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('https://myshop.com');
    expect(next).toHaveBeenCalled();
  });

  it('allows platform domain on merchant API routes', async () => {
    cache.getAllMerchantOrigins.mockResolvedValue([]);
    const { req, res, next } = mockReqRes('/v1/checkout/sessions', 'POST', 'http://localhost:3001');
    await middleware.use(req, res, next);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('http://localhost:3001');
    expect(next).toHaveBeenCalled();
  });

  it('blocks unknown origins on dashboard routes', async () => {
    const { req, res, next } = mockReqRes('/merchants/me', 'GET', 'https://evil.com');
    await middleware.use(req, res, next);
    expect(res._status).toBe(403);
    expect(res._body).toEqual({ error: 'CORS_ORIGIN_DENIED', message: 'Origin not allowed' });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows platform domain on dashboard routes', async () => {
    const { req, res, next } = mockReqRes('/merchants/me', 'GET', 'http://localhost:3001');
    await middleware.use(req, res, next);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('http://localhost:3001');
    expect(next).toHaveBeenCalled();
  });

  it('allows platform domain on /auth/ routes', async () => {
    const { req, res, next } = mockReqRes('/auth/login', 'POST', 'http://localhost:3001');
    await middleware.use(req, res, next);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('http://localhost:3001');
    expect(next).toHaveBeenCalled();
  });

  it('blocks unknown origin on /auth/ routes', async () => {
    const { req, res, next } = mockReqRes('/auth/login', 'POST', 'https://evil.com');
    await middleware.use(req, res, next);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('handles OPTIONS preflight on allowed merchant route', async () => {
    cache.getAllMerchantOrigins.mockResolvedValue(['https://myshop.com']);
    const { req, res, next } = mockReqRes('/v1/checkout/sessions', 'OPTIONS', 'https://myshop.com');
    await middleware.use(req, res, next);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('https://myshop.com');
    expect(res._headers['Access-Control-Max-Age']).toBe('86400');
    expect(res._status).toBe(204);
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks OPTIONS preflight on disallowed merchant route', async () => {
    cache.getAllMerchantOrigins.mockResolvedValue(['https://myshop.com']);
    const { req, res, next } = mockReqRes('/v1/checkout/sessions', 'OPTIONS', 'https://evil.com');
    await middleware.use(req, res, next);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not block requests without origin header', async () => {
    const { req, res, next } = mockReqRes('/v1/checkout/sessions', 'POST');
    await middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('sets correct CORS headers on successful responses', async () => {
    const { req, res, next } = mockReqRes('/v1/checkout/sessions', 'POST', 'https://myshop.com');
    cache.getAllMerchantOrigins.mockResolvedValue(['https://myshop.com']);
    await middleware.use(req, res, next);
    expect(res._headers['Access-Control-Allow-Methods']).toBe(
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    );
    expect(res._headers['Access-Control-Allow-Headers']).toBe(
      'Content-Type,Authorization,X-Requested-With,X-Request-Id,X-Idempotency-Key',
    );
    expect(res._headers['Access-Control-Allow-Credentials']).toBe('true');
  });
});
