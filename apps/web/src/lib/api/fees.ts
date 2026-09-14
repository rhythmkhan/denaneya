export interface FeeCalculationParams {
  amountPaisa: bigint | number | string;
  feeRateBps: bigint | number | string;
  fixedFeePaisa?: bigint | number | string | null;
}

export interface FeeCalculationResult {
  amountPaisa: bigint;
  feeRateBps: bigint;
  percentageFeePaisa: bigint;
  fixedFeePaisa: bigint;
  totalFeePaisa: bigint;
  netSettlementPaisa: bigint;
}

/**
 * Calculates platform fee and net settlement using integer minor units (paisa).
 * Strictly zero floating-point arithmetic.
 *
 * Formula:
 *   percentageFeePaisa = (amountPaisa * feeRateBps) / 10000n
 *   totalFeePaisa = percentageFeePaisa + fixedFeePaisa
 *   netSettlementPaisa = amountPaisa - totalFeePaisa
 */
export function calculatePlatformFee(params: FeeCalculationParams): FeeCalculationResult {
  const amountPaisa = BigInt(params.amountPaisa);
  const feeRateBps = BigInt(params.feeRateBps);
  const fixedFeePaisa = BigInt(params.fixedFeePaisa ?? 0n);

  const percentageFeePaisa = (amountPaisa * feeRateBps) / 10000n;
  const totalFeePaisa = percentageFeePaisa + fixedFeePaisa;
  const netSettlementPaisa = amountPaisa - totalFeePaisa;

  return {
    amountPaisa,
    feeRateBps,
    percentageFeePaisa,
    fixedFeePaisa,
    totalFeePaisa,
    netSettlementPaisa,
  };
}
