import { Test } from '@nestjs/testing';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentRecoveryService } from '../payments/payment-recovery.service';
import { WebhookService } from '../webhook/webhook.service';
import { StellarService } from '../stellar/stellar.service';
import { db } from '../db/index';

jest.mock('../db/index', () => ({
  db: {
    query: {
      payments: { findFirst: jest.fn() },
    },
    execute: jest.fn(),
    update: jest.fn(),
    transaction: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

/**
 * Verifies the @Cron(EVERY_5_MINUTES) wiring itself — that recoverStaleSessions
 * actually runs automatically on the documented schedule once registered with
 * Nest's SchedulerRegistry — as opposed to the other payment-recovery specs,
 * which call the recovery methods directly and never exercise the schedule.
 *
 * Spying on a @Cron-decorated method does not work with @nestjs/schedule:
 * registering before app.init() strips the metadata schedule discovery relies
 * on (no job gets registered at all), and registering after init has no effect
 * because the CronJob already captured the real method. So instead of spying,
 * this lets the real handler run on the fake-timer schedule and observes it
 * through its (mocked) db.execute call.
 */
describe('PaymentRecoveryService cron schedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockDb.execute as jest.Mock).mockResolvedValue([]);
    // Anchor 1s past a 5-minute boundary so EVERY_5_MINUTES has a deterministic
    // ~5-minute gap to the next fire, instead of depending on which second the
    // real wall clock happens to be at when the test runs.
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:01.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function bootstrap() {
    const moduleRef = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        PaymentRecoveryService,
        { provide: WebhookService, useValue: { dispatchWebhook: jest.fn() } },
        {
          provide: StellarService,
          useValue: {
            getPaymentsForAccount: jest.fn().mockResolvedValue([]),
            verifyTransaction: jest.fn(),
          },
        },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  it('does not run before 5 minutes have elapsed', async () => {
    const app = await bootstrap();

    await jest.advanceTimersByTimeAsync(4 * 60 * 1000);
    expect(mockDb.execute).not.toHaveBeenCalled();

    await app.close();
  });

  it('runs the recovery scan automatically every 5 minutes', async () => {
    const app = await bootstrap();

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    expect(mockDb.execute).toHaveBeenCalled();

    const callsAfterFirstRun = (mockDb.execute as jest.Mock).mock.calls.length;
    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect((mockDb.execute as jest.Mock).mock.calls.length).toBeGreaterThan(callsAfterFirstRun);

    await app.close();
  });
});
