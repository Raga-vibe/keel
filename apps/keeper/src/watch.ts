/**
 * Read-only health check of any Hyperliquid account's HIP-3 positions.
 *
 *   npm run watch -- 0xADDRESS [mainnet|testnet]
 *   npm run watch -- --find            # list accounts trading commodities right now
 */
import {
  assessAccount,
  findActiveAccounts,
  loadMarkets,
  makeInfoClient,
  readAccount,
  type NetworkId,
} from "@keel/hedge-sdk";

const [arg, net = "mainnet"] = process.argv.slice(2);
const network = net as NetworkId;
const info = makeInfoClient(network);
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

if (!arg) {
  console.log("usage: npm run watch -- <0xaddress|--find> [mainnet|testnet]");
  process.exit(1);
}

if (arg === "--find") {
  const found = await findActiveAccounts(info, ["xyz:GOLD", "xyz:BRENTOIL", "xyz:SILVER", "xyz:CL", "xyz:COPPER"]);
  for (const a of found) console.log(a.address, a.coins.join(", "));
  process.exit(0);
}

const user = arg as `0x${string}`;
const [account, markets] = await Promise.all([readAccount(info, user, "xyz"), loadMarkets(info, "xyz")]);
const report = assessAccount(account, markets);

console.log(`\n${user} on ${network}`);
console.log(`HIP-3 account value ${usd(account.accountValueUsd ?? 0)} · positions ${usd(report.notionalUsd)} · ${report.atRisk} at risk\n`);
for (const p of report.positions.filter((x) => x.inCatalog)) {
  const pos = p.position;
  const eq = p.equivalents[0];
  console.log(
    `${pos.side === 1 ? "LONG " : "SHORT"} ${pos.coin.padEnd(14)} ${usd(p.notionalUsd).padStart(14)}  ${pos.leverage}x ${pos.marginMode.padEnd(8)} ${p.status.toUpperCase().padEnd(14)}`,
  );
  if (eq) {
    console.log(`       ≈ protects ${eq.direction === "buy" ? "purchases" : "sales"} of ${Math.round(eq.qty).toLocaleString("en-US")} ${eq.unitLabel} of ${eq.label.toLowerCase()}`);
  }
  console.log(`       ${p.recommendation}`);
}
const other = report.positions.filter((x) => !x.inCatalog);
if (other.length) console.log(`\n+ ${other.length} other HIP-3 position(s): ${other.map((o) => o.position.coin).join(", ")}`);
