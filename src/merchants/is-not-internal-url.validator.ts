import { registerDecorator, ValidationOptions } from 'class-validator';

const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal'];

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^fc00:/,
  /^fe80:/,
];

function isPrivateOrReservedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTS.includes(lower)) return true;
  if (PRIVATE_IP_RANGES.some((re) => re.test(lower))) return true;
  return false;
}

export function IsNotInternalUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotInternalUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          try {
            const url = new URL(value);
            if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
            return !isPrivateOrReservedHost(url.hostname);
          } catch {
            return false;
          }
        },
        defaultMessage() {
          return 'URL must not point to a private or internal network address';
        },
      },
    });
  };
}
