import { HealthCheckError } from '@nestjs/terminus';
import { DrizzleHealthIndicator } from './drizzle-health.indicator';
import { db } from '../db';

jest.mock('../db', () => ({
  db: {
    execute: jest.fn(),
  },
}));

describe('DrizzleHealthIndicator', () => {
  const execute = db.execute as jest.Mock;

  beforeEach(() => {
    execute.mockReset();
  });

  it('returns an up status when the Drizzle database ping succeeds', async () => {
    execute.mockResolvedValueOnce([{ one: 1 }]);

    await expect(new DrizzleHealthIndicator().pingCheck('database')).resolves.toEqual({
      database: {
        status: 'up',
      },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('throws a health check error with a down status when the Drizzle database ping fails', async () => {
    execute.mockRejectedValueOnce(new Error('database unavailable'));

    const result = new DrizzleHealthIndicator().pingCheck('database');

    await expect(result).rejects.toBeInstanceOf(HealthCheckError);
    await expect(result).rejects.toMatchObject({
      causes: {
        database: {
          status: 'down',
          message: 'database unavailable',
        },
      },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
