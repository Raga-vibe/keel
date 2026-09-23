/**
 * Keel keeper: runs the guardian on a loop so hedges stay protected while the
 * browser is closed. It signs with the Keel *agent* key, which can trade and
 * move margin but cannot withdraw funds.
 *
 * Env:
 *   KEEL_NETWORK     mainnet | testnet (default testnet)
 *   KEEL_USER        the user's main account address
 *   KEEL_AGENT_KEY   agent private key (exported from the Keel dashboard)
 *   KEEL_HEDGES      path to hedges.json exported from the dashboard (default ./hedges.json)
 *   KEEL_BUILDER     builder address that receives the Keel fee (optional)
 *   KEEL_INTERVAL    seconds between runs (default 60)
 *
 * Flags: --execute to send actions (default is a dry run), --once to run a single pass.
 */
import { readFile, writeFile } from "node:fs/promises";
import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import {
  defaultConfig,
  evaluateGuardian,
  LiveVenue,
  makeInfoClient,
  runGuardianActions,
  type HedgeRecord,
  type NetworkId,
} from "@keel/hedge-sdk";

const network = (process.env.KEEL_NETWORK ?? "testnet") as NetworkId;
const user = process.env.KEEL_USER as `0x${string}` | undefined;
const agentKey = process.env.KEEL_AGENT_KEY as `0x${string}` | undefined;
const hedgesPath = process.env.KEEL_HEDGES ?? "hedges.json";
const intervalSec = Number(process.env.KEEL_INTERVAL ?? 60);
const execute = process.argv.includes("--execute");
const once = process.argv.includes("--once");

if (!user || !agentKey) {
  console.error("Set KEEL_USER and KEEL_AGENT_KEY. See the header of apps/keeper/src/keeper.ts.");
  process.exit(1);
}

const config = defaultConfig(network, process.env.KEEL_BUILDER as `0x${string}` | undefined);
const info = makeInfoClient(network);
const exchange = new ExchangeClient({
  transport: new HttpTransport({ isTestnet: network === "testnet" }),
  wallet: privateKeyToAccount(agentKey),
});
const venue = new LiveVenue({ config, info, exchange, user });

async function loadHedges(): Promise<HedgeRecord[]> {
  const raw = JSON.parse(await readFile(hedgesPath, "utf8")) as { hedges?: HedgeRecord[] } | HedgeRecord[];
  const all = Array.isArray(raw) ? raw : (raw.hedges ?? []);
  return all.filter((h) => h.venue === "live" && h.network === network);
}

async function tick() {
  const hedges = await loadHedges();
  const account = await venue.getAccount();
  const actions = evaluateGuardian({ account, hedges });
  const stamp = new Date().toISOString();
  if (actions.length === 0) {
    console.log(`${stamp}  ${hedges.length} hedge(s) healthy, nothing to do`);
    return;
  }
  for (const a of actions) console.log(`${stamp}  ${a.kind.padEnd(10)} ${a.coin}  ${"reason" in a ? a.reason : a.message}`);
  if (!execute) {
    console.log(`${stamp}  dry run: pass --execute to act`);
    return;
  }
  const { hedges: updated, results } = await runGuardianActions(venue, actions, hedges);
  for (const r of results) {
    if (r.action.kind !== "alert") console.log(`${stamp}  ${r.ok ? "ok  " : "FAIL"} ${r.action.kind} ${r.error ?? ""}`);
  }
  await writeFile(hedgesPath, JSON.stringify({ hedges: updated }, null, 2));
}

console.log(`Keel keeper on ${network} for ${user} (${execute ? "EXECUTING" : "dry run"})`);
do {
  try {
    await tick();
  } catch (err) {
    console.error(new Date().toISOString(), "tick failed:", err instanceof Error ? err.message : err);
  }
  if (!once) await new Promise((r) => setTimeout(r, intervalSec * 1000));
} while (!once);
