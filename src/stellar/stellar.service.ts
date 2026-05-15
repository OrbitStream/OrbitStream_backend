import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private readonly horizonUrl = process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

  async getAccountInfo(walletAddress: string) {
    const { data } = await axios.get(`${this.horizonUrl}/accounts/${walletAddress}`);
    return { id: data.id, sequence: data.sequence, balances: data.balances };
  }

  async getBalance(walletAddress: string, assetCode = 'native'): Promise<number> {
    const { data } = await axios.get(`${this.horizonUrl}/accounts/${walletAddress}`);
    const balance = data.balances?.find((b: any) =>
      assetCode === 'native' ? b.asset_type === 'native' : b.asset_code === assetCode,
    );
    return parseFloat(balance?.balance ?? '0');
  }

  async verifyTransaction(txHash: string): Promise<boolean> {
    try {
      const { data } = await axios.get(`${this.horizonUrl}/transactions/${txHash}`);
      return data.successful === true;
    } catch {
      return false;
    }
  }

  async getTransactionOperations(txHash: string) {
    const { data } = await axios.get(`${this.horizonUrl}/transactions/${txHash}/operations`);
    return data._embedded?.records ?? [];
  }

  async getStreamContractEvents(contractId: string, cursor = 'now') {
    try {
      const rpcUrl = process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org';
      const { data } = await axios.post(rpcUrl, {
        jsonrpc: '2.0', id: 1, method: 'getEvents',
        params: { startLedger: 0, filters: [{ type: 'contract', contractIds: [contractId] }], pagination: { cursor, limit: 100 } },
      });
      return data.result?.events ?? [];
    } catch (err) {
      this.logger.error('Failed to fetch contract events', err.message);
      return [];
    }
  }
}
