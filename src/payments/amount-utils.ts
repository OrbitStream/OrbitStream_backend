/**
 * Converts a financial amount string or number into a BigInt scaled to the specified decimal places (default 7 for Stellar).
 * Prevents IEEE 754 floating point precision loss on large amounts.
 */
export function parseAmountToBigInt(amount: string | number, scale = 7): bigint {
  const str = String(amount).trim();
  if (!str) throw new Error('Empty amount string');
  const isNegative = str.startsWith('-');
  const unsignedStr = isNegative ? str.slice(1) : str;
  const [intStr = '0', decStr = ''] = unsignedStr.split('.');
  const paddedDec = decStr.padEnd(scale, '0').slice(0, scale);
  const result = BigInt(`${intStr || '0'}${paddedDec}`);
  return isNegative ? -result : result;
}

/**
 * Returns true if two financial amount values represent the exact same value up to `scale` decimal places.
 */
export function areAmountsEqual(a: string | number, b: string | number, scale = 7): boolean {
  try {
    return parseAmountToBigInt(a, scale) === parseAmountToBigInt(b, scale);
  } catch {
    return false;
  }
}
