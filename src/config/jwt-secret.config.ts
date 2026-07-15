/**
 * Centralised JWT secret resolution + hardening.
 *
 * Responsibilities:
 *  - Reject insecure secrets at startup (missing / dev placeholder / too short)
 *    when running in production.
 *  - Support zero-downtime secret rotation via `JWT_SECRET_PREVIOUS`.
 *
 * This module is intentionally framework-agnostic (no Nest decorators) so it can
 * be imported from `main.ts`, the auth module and tests without bootstrapping the
 * whole DI container.
 */

export const MIN_JWT_SECRET_LENGTH = 32;

/** Values that must never be used as a real secret. */
export const INSECURE_JWT_SECRETS = [
  'dev-secret',
  'dev-secret-for-local-development-only!',
  'change-me-in-production',
];

export interface ResolvedJwtSecrets {
  /** The active secret used to sign newly issued tokens. */
  current: string;
  /** The previous secret, accepted for verification during a rotation window. */
  previous?: string;
}

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * Validate the configured `JWT_SECRET` and (optional) `JWT_SECRET_PREVIOUS`.
 *
 * Throws an `Error` with an actionable message when the configuration is unsafe.
 * In development a missing/insecure secret falls back to `dev-secret` so local
 * workflows keep working, but in production every check is fatal.
 */
export function resolveJwtSecrets(env: NodeJS.ProcessEnv = process.env): ResolvedJwtSecrets {
  const prod = isProduction(env);
  const current = env.JWT_SECRET;

  if (!current || current.length === 0) {
    if (prod) {
      throw new Error(
        'JWT_SECRET is not set. A strong secret (>= ' +
          MIN_JWT_SECRET_LENGTH +
          ' characters) is required in production.',
      );
    }
    // Development convenience only — must still meet minimum length.
    return { current: 'dev-secret-for-local-development-only!' };
  }

  if (INSECURE_JWT_SECRETS.includes(current)) {
    if (prod) {
      throw new Error(
        `JWT_SECRET is still set to the insecure placeholder "${current}". ` +
          'Generate a unique secret before deploying to production (e.g. `openssl rand -base64 48`).',
      );
    }
    // Allow placeholders in development, but normalise to dev-secret.
    return { current };
  }

  if (current.length < MIN_JWT_SECRET_LENGTH) {
    // Length is a hard requirement in every environment so misconfiguration is
    // caught long before it reaches production.
    throw new Error(
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long ` +
        `(got ${current.length}).`,
    );
  }

  const previous = env.JWT_SECRET_PREVIOUS;
  if (previous && previous.length > 0) {
    if (previous.length < MIN_JWT_SECRET_LENGTH && prod) {
      throw new Error(
        `JWT_SECRET_PREVIOUS must be at least ${MIN_JWT_SECRET_LENGTH} characters long ` +
          `(got ${previous.length}).`,
      );
    }
    return { current, previous };
  }

  return { current };
}

/** The JWT token lifetime, defaulting to 7 days. */
export function jwtExpiresIn(env: NodeJS.ProcessEnv = process.env): string {
  return env.JWT_EXPIRES_IN ?? '7d';
}
