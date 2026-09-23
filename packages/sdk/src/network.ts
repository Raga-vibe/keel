export type NetworkId = "mainnet" | "testnet";

export interface KeelConfig {
  network: NetworkId;
  /** HIP-3 dex that lists the real-world markets. */
  dex: string;
  /** Address that receives Keel's builder fee. Undefined disables the fee. */
  builderAddress?: `0x${string}`;
  /** Builder fee in tenths of a basis point (10 = 0.01%). Hyperliquid caps perps at 100. */
  builderFeeTenthsBp: number;
  /**
   * Conservative estimate of the exchange taker fee (as a fraction of notional)
   * used for cost previews. Actual fees depend on the user's volume tier and the
   * HIP-3 deployer's fee settings.
   */
  estTakerFee: number;
  /** Max slippage tolerated on market (IOC) orders, as a fraction. */
  maxSlippage: number;
}

export const DEFAULT_BUILDER_FEE_TENTHS_BP = 30; // 0.03% of notional

export function defaultConfig(network: NetworkId, builderAddress?: `0x${string}`): KeelConfig {
  return {
    network,
    dex: "xyz",
    builderAddress,
    builderFeeTenthsBp: DEFAULT_BUILDER_FEE_TENTHS_BP,
    estTakerFee: 0.0009,
    maxSlippage: 0.01,
  };
}

/** Builder fee as a fraction of notional (30 tenths-bp → 0.0003). */
export function builderFeeFraction(cfg: KeelConfig): number {
  return cfg.builderAddress ? cfg.builderFeeTenthsBp / 100_000 : 0;
}

/** Percent string accepted by `approveBuilderFee`, e.g. 30 → "0.03%". */
export function builderFeePercentString(tenthsBp: number): string {
  return `${(tenthsBp / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
}
