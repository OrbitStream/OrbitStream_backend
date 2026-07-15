import { DrizzleHealthIndicator } from '../monitoring/drizzle-health.indicator';

jest.mock('../db/index', () => ({
  db: {
    execute: jest.fn(),
  },
}));

import { db } from '../db/index';

const mockDb = db as jest.Mocked<typeof db>;

describe('DrizzleHealthIndicator', () => {
  let indicator: DrizzleHealthIndicator;

  beforeEach(() => {
    jest.clearAllMocks();
    indicator = new DrizzleHealthIndicator();
  });

  it('returns up status when database responds', async () => {
    (mockDb.execute as jest.Mock).mockResolvedValueOnce([]);

    const result = await indicator.pingCheck('database');

    expect(result).toEqual({ database: { status: 'up' } });
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
  });

  it('returns down status when database query fails', async () => {
    (mockDb.execute as jest.Mock).mockRejectedValueOnce(new Error('connection refused'));

    const result = await indicator.pingCheck('database');

    expect(result).toEqual({
      database: { status: 'down', message: 'connection refused' },
    });
  });

  it('returns down status with generic message when error is not an Error instance', async () => {
    (mockDb.execute as jest.Mock).mockRejectedValueOnce('string error');

    const result = await indicator.pingCheck('database');

    expect(result).toEqual({
      database: { status: 'down', message: 'Database connection failed' },
    });
  });

  it('uses the provided key in the result', async () => {
    (mockDb.execute as jest.Mock).mockResolvedValueOnce([]);

    const result = await indicator.pingCheck('postgres');

    expect(result).toEqual({ postgres: { status: 'up' } });
  });
});
