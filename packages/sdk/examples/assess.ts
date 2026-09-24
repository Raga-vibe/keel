/**
 * Risk report for a live account that is trading commodities right now.
 *   npx tsx examples/assess.ts
 */
import { assessAccount, findActiveAccounts, loadMarkets, makeInfoClient, readAccount } from "../src";

const info = makeInfoClient("mainnet");
const [candidate] = await findActiveAccounts(info, ["xyz:GOLD", "xyz:BRENTOIL", "xyz:SILVER"], 1);
if (!candidate) throw new Error("No recent commodity trades found");

const [account, markets] = await Promise.all([readAccount(info, candidate.address, "xyz"), loadMarkets(info, "xyz")]);
const report = assessAccount(account, markets);

console.log(`${candidate.address}: ${report.positions.length} HIP-3 positions, ${report.atRisk} near liquidation`);
for (const a of report.positions.filter((x) => x.inCatalog)) {
  const eq = a.equivalents[0];
  console.log(`- ${a.position.coin} ${a.status}: ${a.recommendation}`);
  if (eq) console.log(`  ≈ ${eq.direction === "buy" ? "purchases" : "sales"} of ${eq.qty.toFixed(0)} ${eq.unitLabel} of ${eq.label.toLowerCase()}`);
}
