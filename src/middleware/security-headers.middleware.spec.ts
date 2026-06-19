import { SecurityHeadersMiddleware } from './security-headers.middleware';

function mockReqRes() {
  const headers: Record<string, string> = {};
  const req = { headers: {} } as any;
  const res = {
    _headers: headers,
    setHeader(k: string, v: string) { headers[k] = v; },
  } as any;
  const next = jest.fn();
  return { req, res, next };
}

describe('SecurityHeadersMiddleware', () => {
  let middleware: SecurityHeadersMiddleware;

  beforeEach(() => {
    middleware = new SecurityHeadersMiddleware();
  });

  it('sets Strict-Transport-Security header', () => {
    const { req, res, next } = mockReqRes();
    middleware.use(req, res, next);
    expect(res._headers['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
  });

  it('sets X-Content-Type-Options header', () => {
    const { req, res, next } = mockReqRes();
    middleware.use(req, res, next);
    expect(res._headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('sets X-Frame-Options header', () => {
    const { req, res, next } = mockReqRes();
    middleware.use(req, res, next);
    expect(res._headers['X-Frame-Options']).toBe('DENY');
  });

  it('sets X-XSS-Protection header', () => {
    const { req, res, next } = mockReqRes();
    middleware.use(req, res, next);
    expect(res._headers['X-XSS-Protection']).toBe('1; mode=block');
  });

  it('sets Referrer-Policy header', () => {
    const { req, res, next } = mockReqRes();
    middleware.use(req, res, next);
    expect(res._headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('sets Content-Security-Policy header', () => {
    const { req, res, next } = mockReqRes();
    middleware.use(req, res, next);
    expect(res._headers['Content-Security-Policy']).toBeDefined();
  });

  it('calls next()', () => {
    const { req, res, next } = mockReqRes();
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
