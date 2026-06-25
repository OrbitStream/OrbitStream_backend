/**
 * Auth flow integration tests (HTTP layer).
 *
 * Exercises the full SEP-10 challenge/verify flow through the real NestJS
 * HTTP stack: AuthController → AuthService → JwtService → JwtStrategy.
 *
 * Redis and Horizon are mocked so no real network connections are opened.
 * The JWT secret comes from jest-setup.ts (process.env.JWT_SECRET) so
 * JwtStrategy and JwtModule share the same signing key.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { RedisService } from '../redis/redis.service';

jest.mock('axios', () => {
  const mock: any = jest.fn();
  mock.get = jest.fn();
  mock.post = jest.fn();
  mock.create = jest.fn(() => mock);
  mock.interceptors = {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  };
  mock.defaults = { headers: { common: {} } };
  return mock;
});

const mockedAxios = axios as jest.Mocked<typeof axios>;

// process.env.JWT_SECRET is set to 'test-secret-with-at-least-32-characters' in jest-setup.ts
const JWT_SECRET = process.env.JWT_SECRET!;
const serverKeypair = StellarSdk.Keypair.random();
const clientKeypair = StellarSdk.Keypair.random();

// In-memory nonce store shared across service calls within a test.
const nonceStore: Record<string, string> = {};

const redisMock = {
  get: jest.fn((key: string) => Promise.resolve(nonceStore[key] ?? null)),
  set: jest.fn((key: string, value: string) => {
    nonceStore[key] = value;
    return Promise.resolve('OK');
  }),
  del: jest.fn((key: string) => {
    delete nonceStore[key];
    return Promise.resolve(1);
  }),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
};

describe('Auth flow integration (HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        JwtStrategy,
        { provide: RedisService, useValue: { getClient: () => redisMock } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, unknown> = {
                STELLAR_PLATFORM_SECRET_KEY: serverKeypair.secret(),
                CHALLENGE_TTL_SECONDS: 300,
                STELLAR_NETWORK: 'testnet',
                STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
              };
              return map[key];
            },
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(nonceStore).forEach((k) => delete nonceStore[k]);

    redisMock.get.mockImplementation((key: string) => Promise.resolve(nonceStore[key] ?? null));
    redisMock.set.mockImplementation((key: string, value: string) => {
      nonceStore[key] = value;
      return Promise.resolve('OK');
    });
    redisMock.del.mockImplementation((key: string) => {
      delete nonceStore[key];
      return Promise.resolve(1);
    });
    redisMock.incr.mockResolvedValue(1);
    redisMock.expire.mockResolvedValue(1);
  });

  describe('POST /auth/challenge', () => {
    it('returns a signed transaction envelope and network passphrase', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ walletAddress: clientKeypair.publicKey() });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('transaction');
      expect(res.body).toHaveProperty('passphrase', StellarSdk.Networks.TESTNET);
      expect(res.body).toHaveProperty('expiresAt');
      expect(redisMock.set).toHaveBeenCalledWith(
        `challenge:${clientKeypair.publicKey()}`,
        expect.any(String),
        'EX',
        300,
      );
    });

    it('returns 400 when walletAddress is missing', async () => {
      const res = await request(app.getHttpServer()).post('/auth/challenge').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('challenge → verify → JWT', () => {
    it('issues a JWT after a valid client signature', async () => {
      // Step 1: request challenge
      const challengeRes = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ walletAddress: clientKeypair.publicKey() });

      expect(challengeRes.status).toBe(200);

      // Step 2: client signs the envelope
      const { transaction: txEnvelope, passphrase } = challengeRes.body;
      const tx = StellarSdk.TransactionBuilder.fromXDR(
        txEnvelope,
        passphrase,
      ) as StellarSdk.Transaction;
      tx.sign(clientKeypair);

      // Step 3: mock Horizon signer lookup
      mockedAxios.get.mockResolvedValue({
        data: { signers: [{ key: clientKeypair.publicKey(), weight: 1 }] },
      });

      // Step 4: verify challenge
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({
          walletAddress: clientKeypair.publicKey(),
          transaction: { tx: tx.toEnvelope().toXDR('base64'), passphrase },
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body).toHaveProperty('access_token');
      expect(typeof verifyRes.body.access_token).toBe('string');
      expect(verifyRes.body.wallet).toBe(clientKeypair.publicKey());

      // Step 5: use JWT on a protected endpoint (POST /auth/refresh)
      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${verifyRes.body.access_token}`);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body).toHaveProperty('access_token');
    });
  });

  describe('POST /auth/verify — rejection cases', () => {
    it('returns 401 when no challenge has been issued for the wallet', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({
          walletAddress: clientKeypair.publicKey(),
          transaction: { tx: 'AAAAAgAAAAA=', passphrase: StellarSdk.Networks.TESTNET },
        });

      expect(res.status).toBe(401);
    });

    it('returns 401 when the client signs with the wrong key', async () => {
      const challengeRes = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ walletAddress: clientKeypair.publicKey() });

      const { transaction: txEnvelope, passphrase } = challengeRes.body;
      const tx = StellarSdk.TransactionBuilder.fromXDR(
        txEnvelope,
        passphrase,
      ) as StellarSdk.Transaction;
      tx.sign(StellarSdk.Keypair.random()); // wrong key

      mockedAxios.get.mockResolvedValue({
        data: { signers: [{ key: clientKeypair.publicKey(), weight: 1 }] },
      });

      const res = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({
          walletAddress: clientKeypair.publicKey(),
          transaction: { tx: tx.toEnvelope().toXDR('base64'), passphrase },
        });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/refresh — protected endpoint', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const res = await request(app.getHttpServer()).post('/auth/refresh');
      expect(res.status).toBe(401);
    });
  });
});
