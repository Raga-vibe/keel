import type { ExchangeClient, InfoClient } from "@nktkas/hyperliquid";
import { builderFeePercentString, type KeelConfig } from "./network";

export const AGENT_NAME = "keel";
/** Hyperliquid allows agent approvals of up to 180 days. */
export const AGENT_VALIDITY_DAYS = 170;

export interface OnboardingStatus {
  /** Account can trade HIP-3 markets without manual transfers between dexes. */
  collateralRouting: boolean;
  abstraction: string;
  /** Builder fee the user has approved for Keel, in tenths of a bp. */
  approvedBuilderFee: number;
  builderApproved: boolean;
  agentApproved: boolean;
  agentValidUntil?: number;
  /** USDC available to use as margin. */
  hasFunds: boolean;
}

/**
 * What the user still needs to sign before Keel can hedge for them. All three
 * approvals are signed once by the user's own wallet; afterwards the Keel agent
 * key signs trades but can never withdraw funds.
 */
export async function getOnboardingStatus(
  info: InfoClient,
  cfg: KeelConfig,
  user: `0x${string}`,
  agentAddress?: `0x${string}`,
): Promise<OnboardingStatus> {
  const [abstraction, dexAbstraction, agents, builderFee, main, spot] = await Promise.all([
    info.userAbstraction({ user }).catch(() => "default"),
    info.userDexAbstraction({ user }).catch(() => null),
    info.extraAgents({ user }).catch(() => []),
    cfg.builderAddress ? info.maxBuilderFee({ user, builder: cfg.builderAddress }).catch(() => 0) : Promise.resolve(0),
    info.clearinghouseState({ user }).catch(() => null),
    info.spotClearinghouseState({ user }).catch(() => null),
  ]);

  const agent = agentAddress
    ? agents.find((a) => a.address.toLowerCase() === agentAddress.toLowerCase())
    : undefined;
  const collateralRouting =
    abstraction === "unifiedAccount" || abstraction === "portfolioMargin" || dexAbstraction === true;
  const usdc = spot?.balances.find((b) => b.coin === "USDC");
  const funds = Number(main?.withdrawable ?? 0) + (usdc ? Number(usdc.total) - Number(usdc.hold) : 0);

  return {
    collateralRouting,
    abstraction: String(abstraction),
    approvedBuilderFee: Number(builderFee),
    builderApproved: !cfg.builderAddress || Number(builderFee) >= cfg.builderFeeTenthsBp,
    agentApproved: Boolean(agent && (!agent.validUntil || agent.validUntil > Date.now())),
    agentValidUntil: agent?.validUntil ?? undefined,
    hasFunds: funds >= 10,
  };
}

/** Switch the account to unified mode so one USDC balance margins HIP-3 markets. */
export function enableUnifiedAccount(main: ExchangeClient, user: `0x${string}`) {
  return main.userSetAbstraction({ user, abstraction: "unifiedAccount" });
}

export function approveKeelAgent(main: ExchangeClient, agentAddress: `0x${string}`, now = Date.now()) {
  const validUntil = now + AGENT_VALIDITY_DAYS * 24 * 3600 * 1000;
  return main.approveAgent({ agentAddress, agentName: `${AGENT_NAME} valid_until ${validUntil}` });
}

export function approveKeelBuilderFee(main: ExchangeClient, cfg: KeelConfig) {
  if (!cfg.builderAddress) throw new Error("No builder address configured");
  return main.approveBuilderFee({
    builder: cfg.builderAddress,
    maxFeeRate: builderFeePercentString(cfg.builderFeeTenthsBp),
  });
}
