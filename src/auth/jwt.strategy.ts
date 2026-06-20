import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwt from 'jsonwebtoken';
import { resolveJwtSecrets } from '../config/jwt-secret.config';

/**
 * JWT strategy with rotation support.
 *
 * Tokens are accepted if they verify against EITHER the current secret or the
 * previous secret (`JWT_SECRET_PREVIOUS`). passport-jwt only verifies against a
 * single key, so we use a `secretOrKeyProvider` that picks the key the token was
 * actually signed with (current first, then previous). When the previous secret
 * is used we stash a flag on the request so `validate` can expose
 * `viaPreviousSecret`, letting the login flow re-issue the token with the current
 * secret for zero-downtime rotation.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKeyProvider: (
        req: any,
        rawJwtToken: string,
        done: (err: Error | null, secret?: string) => void,
      ) => {
        try {
          const { current, previous } = resolveJwtSecrets();
          // Verify against the current secret first.
          try {
            jwt.verify(rawJwtToken, current);
            return done(null, current);
          } catch {
            // Fall through to the previous secret (rotation window).
          }
          if (previous) {
            try {
              jwt.verify(rawJwtToken, previous);
              if (req) req.jwtViaPreviousSecret = true;
              return done(null, previous);
            } catch {
              // Neither secret matched.
            }
          }
          // Returning the current secret lets passport-jwt fail verification with
          // its standard "invalid signature" error.
          return done(null, current);
        } catch (err) {
          return done(err as Error);
        }
      },
    });
  }

  async validate(req: any, payload: any) {
    return {
      walletAddress: payload.walletAddress,
      viaPreviousSecret: req?.jwtViaPreviousSecret === true,
    };
  }
}
