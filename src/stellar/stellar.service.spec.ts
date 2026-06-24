import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from './stellar.service';
import axios from 'axios';

jest.mock('axios', () => {
  const mockAxios: any = jest.fn();
  mockAxios.get = jest.fn();
  mockAxios.isAxiosError = jest.fn((e: unknown) => (e as any)?.__isAxiosError === true);
  mockAxios.create = jest.fn(() => mockAxios);
  mockAxios.defaults = { headers: { common: {} } };
  mockAxios.interceptors = {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  };
  return mockAxios;
});

const mockedGet = axios.get as jest.Mock;

const WALLET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const accountData = {
  id: WALLET,
  sequence: '123456789',
  balances: [
    { asset_type: 'native', balance: '100.0000000' },
    {
      asset_type: 'credit_alphanum4',
      asset_code: 'USDC',
      asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      balance: '500.0000000',
    },
  ],
};

describe('StellarService', () => {
  let service: StellarService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StellarService],
    }).compile();
    service = module.get(StellarService);
  });

  describe('getAccountInfo', () => {
    it('returns id, sequence and balances from Horizon', async () => {
      mockedGet.mockResolvedValue({ data: accountData });

      const result = await service.getAccountInfo(WALLET);

      expect(result).toEqual({
        id: WALLET,
        sequence: '123456789',
        balances: accountData.balances,
      });
      expect(mockedGet).toHaveBeenCalledWith(expect.stringContaining(`/accounts/${WALLET}`));
    });
  });

  describe('getBalance', () => {
    it('returns native balance when asset is "native"', async () => {
      mockedGet.mockResolvedValue({ data: accountData });

      const balance = await service.getBalance(WALLET, 'native');
      expect(balance).toBe(100.0);
    });

    it('returns USDC balance when asset is "USDC"', async () => {
      mockedGet.mockResolvedValue({ data: accountData });

      const balance = await service.getBalance(WALLET, 'USDC');
      expect(balance).toBe(500.0);
    });

    it('returns 0 when asset is not found in balances', async () => {
      mockedGet.mockResolvedValue({ data: accountData });

      const balance = await service.getBalance(WALLET, 'UNKNOWN');
      expect(balance).toBe(0);
    });
  });

  describe('verifyTransaction', () => {
    it('returns true for a successful transaction', async () => {
      mockedGet.mockResolvedValue({ data: { successful: true } });

      const result = await service.verifyTransaction('txhash-abc');
      expect(result).toBe(true);
    });

    it('returns false for an unsuccessful transaction', async () => {
      mockedGet.mockResolvedValue({ data: { successful: false } });

      const result = await service.verifyTransaction('txhash-abc');
      expect(result).toBe(false);
    });

    it('returns false when Horizon throws (e.g. 404)', async () => {
      mockedGet.mockRejectedValue(new Error('Network error'));

      const result = await service.verifyTransaction('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getTransactionOperations', () => {
    it('returns the records array from Horizon', async () => {
      const ops = [{ type: 'payment', amount: '10.0000000' }];
      mockedGet.mockResolvedValue({ data: { _embedded: { records: ops } } });

      const result = await service.getTransactionOperations('txhash-abc');
      expect(result).toEqual(ops);
    });

    it('returns empty array when _embedded is absent', async () => {
      mockedGet.mockResolvedValue({ data: {} });

      const result = await service.getTransactionOperations('txhash-abc');
      expect(result).toEqual([]);
    });
  });

  describe('getPaymentsPage', () => {
    it('returns records and rate-limit headers', async () => {
      const records = [{ id: 'op-1', type: 'payment' }];
      mockedGet.mockResolvedValue({
        status: 200,
        data: { _embedded: { records } },
        headers: { 'x-ratelimit-limit': '200', 'x-ratelimit-remaining': '150' },
      });

      const page = await service.getPaymentsPage(WALLET, 'now');

      expect(page.records).toEqual(records);
      expect(page.rateLimitLimit).toBe(200);
      expect(page.rateLimitRemaining).toBe(150);
      expect(page.httpStatus).toBe(200);
    });

    it('omits cursor param when cursor is "now"', async () => {
      mockedGet.mockResolvedValue({
        status: 200,
        data: { _embedded: { records: [] } },
        headers: {},
      });

      await service.getPaymentsPage(WALLET, 'now');

      const [, config] = mockedGet.mock.calls[0];
      expect(config?.params?.cursor).toBeUndefined();
    });

    it('includes cursor param when a valid cursor is provided', async () => {
      mockedGet.mockResolvedValue({
        status: 200,
        data: { _embedded: { records: [] } },
        headers: {},
      });

      await service.getPaymentsPage(WALLET, '12345678');

      const [, config] = mockedGet.mock.calls[0];
      expect(config?.params?.cursor).toBe('12345678');
    });

    it('propagates Horizon errors so callers can inspect status codes', async () => {
      const err: any = new Error('Rate limited');
      err.__isAxiosError = true;
      err.response = { status: 429 };
      mockedGet.mockRejectedValue(err);

      await expect(service.getPaymentsPage(WALLET)).rejects.toThrow('Rate limited');
    });
  });

  describe('getAssetInfo', () => {
    it('returns native type for XLM', async () => {
      const info = await service.getAssetInfo('XLM');
      expect(info).toEqual({ type: 'native', code: 'XLM' });
    });

    it('returns native type for "native"', async () => {
      const info = await service.getAssetInfo('native');
      expect(info).toEqual({ type: 'native', code: 'XLM' });
    });

    it('returns credit type for non-native assets', async () => {
      const issuer = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
      const info = await service.getAssetInfo('USDC', issuer);
      expect(info).toEqual({ type: 'credit_alphanum4', code: 'USDC', issuer });
    });
  });

  describe('getHttpStatusFromError', () => {
    it('extracts status from an AxiosError', () => {
      const err: any = new Error('not found');
      err.__isAxiosError = true;
      err.response = { status: 404 };
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);

      const status = service.getHttpStatusFromError(err);
      expect(status).toBe(404);
    });

    it('returns 0 for plain errors', () => {
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
      const status = service.getHttpStatusFromError(new Error('oops'));
      expect(status).toBe(0);
    });
  });
});
