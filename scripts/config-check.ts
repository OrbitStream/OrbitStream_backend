import 'dotenv/config';
import { validate } from '../src/config/config.schema';

try {
  const config = validate(process.env as Record<string, unknown>);
  console.log('✓ Config is valid');
  const nodeEnv = config.NODE_ENV;
  const dbUrl = config.DATABASE_URL.replace(/:\/\/[^@]+@/, '://<credentials>@');
  console.log(`  NODE_ENV=${nodeEnv}`);
  console.log(`  DATABASE_URL=${dbUrl}`);
  console.log(`  REDIS_URL=${config.REDIS_URL}`);
  console.log(`  STELLAR_NETWORK=${config.STELLAR_NETWORK}`);
  process.exit(0);
} catch (err) {
  console.error('✗ Config validation failed:');
  console.error((err as Error).message);
  process.exit(1);
}
