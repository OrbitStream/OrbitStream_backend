import { areAmountsEqual, parseAmountToBigInt } from '../payments/amount-utils';

describe('amount-utils', () => {
  describe('parseAmountToBigInt', () => {
    it('parses whole numbers and decimals correctly with default 7 decimal places', () => {
      expect(parseAmountToBigInt('10')).toBe(100_000_000n);
      expect(parseAmountToBigInt('10.5')).toBe(105_000_000n);
      expect(parseAmountToBigInt('10.5000000')).toBe(105_000_000n);
      expect(parseAmountToBigInt('0.0000001')).toBe(1n);
      expect(parseAmountToBigInt('0.0000002')).toBe(2n);
    });

    it('handles large Stellar amounts without floating point precision loss', () => {
      const amt1 = '123456789012345.1234567';
      const amt2 = '123456789012345.1234568';
      expect(parseAmountToBigInt(amt1)).toBe(1234567890123451234567n);
      expect(parseAmountToBigInt(amt2)).toBe(1234567890123451234568n);
      expect(parseAmountToBigInt(amt1)).not.toBe(parseAmountToBigInt(amt2));
    });

    it('handles leading zeros and negative numbers', () => {
      expect(parseAmountToBigInt('0010.5')).toBe(105_000_000n);
      expect(parseAmountToBigInt('-10.5')).toBe(-105_000_000n);
    });

    it('throws error for empty string', () => {
      expect(() => parseAmountToBigInt('')).toThrow();
    });
  });

  describe('areAmountsEqual', () => {
    it('returns true when amounts are equal regardless of trailing zeros format', () => {
      expect(areAmountsEqual('10.5', '10.5000000')).toBe(true);
      expect(areAmountsEqual('100', '100.0000000')).toBe(true);
      expect(areAmountsEqual('0.0000001', '0.0000001')).toBe(true);
    });

    it('returns false when 7th decimal digit differs', () => {
      expect(areAmountsEqual('123456789012345.1234567', '123456789012345.1234568')).toBe(false);
      expect(areAmountsEqual('0.0000001', '0.0000002')).toBe(false);
    });

    it('returns false for invalid amount strings', () => {
      expect(areAmountsEqual('invalid', '10.5')).toBe(false);
    });
  });
});
