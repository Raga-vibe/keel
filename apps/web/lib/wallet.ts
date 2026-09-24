import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { NetworkId } from "@keel/hedge-sdk";
import { readJson, safeStorage, writeJson } from "./storage";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

function makeClient(address: `0x${string}`, provider: EIP1193Provider) {
  return createWalletClient({ account: address, transport: custom(provider) });
}

export interface ConnectedWallet {
  address: `0x${string}`;
  /** Wallet client bound to the connected account, so the SDK can sign EIP-712 with it. */
  client: ReturnType<typeof makeClient>;
}

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export async function connectInjected(): Promise<ConnectedWallet> {
  const provider = window.ethereum;
  if (!provider) throw new Error("No browser wallet found. Install MetaMask or Rabby to trade live.");
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
  const address = accounts[0];
  if (!address) throw new Error("Wallet returned no accounts");
  return { address, client: makeClient(address, provider) };
}

/**
 * The Keel agent: a key generated in this browser and approved once by the
 * user's wallet. It can place orders and move margin for the user, but
 * Hyperliquid never lets agent keys withdraw or transfer funds out.
 */
export interface AgentKey {
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

const agentKey = (network: NetworkId, user: string) => `keel:agent:${network}:${user.toLowerCase()}`;

export function loadAgent(network: NetworkId, user: string): AgentKey | null {
  return readJson<AgentKey | null>(agentKey(network, user), null);
}

export function createAgent(network: NetworkId, user: string): AgentKey {
  const privateKey = generatePrivateKey();
  const agent = { address: privateKeyToAccount(privateKey).address, privateKey };
  writeJson(agentKey(network, user), agent);
  return agent;
}

export function forgetAgent(network: NetworkId, user: string) {
  safeStorage.remove(agentKey(network, user));
}
