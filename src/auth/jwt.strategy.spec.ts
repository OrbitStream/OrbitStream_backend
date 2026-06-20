import * as jwt from 'jsonwebtoken';
import { JwtStrategy } from './jwt.strategy';

const CURRENT = 'current-secret-current-secret-1234'; // >= 32 chars
const PREVIOUS = 'previous-secret-previous-secret-9'; // >= 32 chars

/**
 * The strategy reads its secrets from env at verify-time via `resolveJwtSecrets`,
 * so we exercise the `secretOrKeyProvider` directly to assert rotation behaviour
 * without standing up Passport's full request pipeline.
 */
function provider(strategy: JwtStrategy) {
  return (strategy as any)._secretOrKeyProvider as (
    req: any,
    token: string,
    done: (err: Error | null, secret?: string) => void,
  ) => void;
}

function resolveSecret(
  strategy: JwtStrategy,
  req: any,
  token: string,
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    provider(strategy)(req, token, (err, secret) => (err ? reject(err) : resolve(secret)));
  });
}

describe('JwtStrategy (rotation)', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('verifies a token signed with the current secret', async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = CURRENT;
    delete process.env.JWT_SECRET_PREVIOUS;

    const strategy = new JwtStrategy();
    const token = jwt.sign({ walletAddress: 'GABC' }, CURRENT);
    const req: any = {};

    const secret = await resolveSecret(strategy, req, token);
    expect(secret).toBe(CURRENT);
    expect(req.jwtViaPreviousSecret).toBeUndefined();

    const result = await strategy.validate(req, { walletAddress: 'GABC' });
    expect(result).toEqual({ walletAddress: 'GABC', viaPreviousSecret: false });
  });

  it('accepts a token signed with the previous secret and flags it for re-issue', async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = CURRENT;
    process.env.JWT_SECRET_PREVIOUS = PREVIOUS;

    const strategy = new JwtStrategy();
    const token = jwt.sign({ walletAddress: 'GXYZ' }, PREVIOUS);
    const req: any = {};

    const secret = await resolveSecret(strategy, req, token);
    expect(secret).toBe(PREVIOUS);
    expect(req.jwtViaPreviousSecret).toBe(true);

    const result = await strategy.validate(req, { walletAddress: 'GXYZ' });
    expect(result).toEqual({ walletAddress: 'GXYZ', viaPreviousSecret: true });
  });

  it('rejects a token signed with an unknown secret', async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = CURRENT;
    process.env.JWT_SECRET_PREVIOUS = PREVIOUS;

    const strategy = new JwtStrategy();
    const token = jwt.sign({ walletAddress: 'GBAD' }, 'totally-different-secret-totally-diff');
    const req: any = {};

    // Provider falls back to the current secret so passport-jwt rejects the
    // signature; the previous-secret flag must NOT be set.
    const secret = await resolveSecret(strategy, req, token);
    expect(secret).toBe(CURRENT);
    expect(req.jwtViaPreviousSecret).toBeUndefined();
  });
});
