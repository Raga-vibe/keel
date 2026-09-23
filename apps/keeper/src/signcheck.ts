/**
 * Integration check for the signing path. Signs a real order for a HIP-3 market
 * with a throwaway key and sends it to testnet. The key has no account, so
 * Hyperliquid must reject it *after* recovering the signer — which proves the
 * action encoding, asset id and signature are all accepted.
 */
import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { catalogCoins, defaultConfig, loadMarkets, makeInfoClient } from "@keel/hedge-sdk";
import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils";

const info = makeInfoClient("testnet");
const markets = await loadMarkets(info, "xyz", catalogCoins());
const m = markets.get("xyz:BRENTOIL") ?? [...markets.values()][0]!;
const wallet = privateKeyToAccount(generatePrivateKey());
const exchange = new ExchangeClient({ transport: new HttpTransport({ isTestnet: true }), wallet });
const cfg = defaultConfig("testnet", "0x000000000000000000000000000000000000beef");

console.log(`market ${m.coin} asset ${m.assetId} mark ${m.markPx}; signer ${wallet.address}`);
try {
  await exchange.order({
    orders: [
      {
        a: m.assetId,
        b: true,
        p: formatPrice(m.markPx * 0.5, m.szDecimals),
        s: formatSize(20 / m.markPx + 10 ** -m.szDecimals, m.szDecimals),
        r: false,
        t: { limit: { tif: "Gtc" } },
      },
    ],
    grouping: "na",
    builder: { b: cfg.builderAddress!, f: cfg.builderFeeTenthsBp },
  });
  console.log("unexpected success");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log("exchange replied:", msg);
  const recovered = msg.toLowerCase().includes(wallet.address.toLowerCase());
  console.log(recovered ? "PASS: signature recovered to our signer" : "CHECK: signer not echoed, inspect message");
}
