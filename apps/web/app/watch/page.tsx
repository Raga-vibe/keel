"use client";

import {
  assessAccount,
  EXPOSURES,
  findActiveAccounts,
  loadMarkets,
  makeInfoClient,
  readAccount,
  typicalFunding,
  type AccountAssessment,
  type ActiveAccount,
  type NetworkId,
  type PositionAssessment,
} from "@keel/hedge-sdk";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { HealthBar } from "@/components/dashboard/HealthBar";
import { pct, price, qty, shortAddr, ticker, usd } from "@/lib/format";

const EXAMPLE_COINS = ["xyz:GOLD", "xyz:BRENTOIL", "xyz:SILVER", "xyz:CL", "xyz:COPPER", "xyz:EUR"];
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function instrumentLabel(coin: string): string {
  for (const e of EXPOSURES) {
    const i = e.instruments.find((x) => x.coin === coin);
    if (i) return i.label;
  }
  return ticker(coin);
}

export default function WatchPage() {
  return (
    <Suspense fallback={null}>
      <Watch />
    </Suspense>
  );
}

function Watch() {
  const params = useSearchParams();
  const router = useRouter();
  const [input, setInput] = useState(params.get("address") ?? "");
  const [network, setNetwork] = useState<NetworkId>((params.get("network") as NetworkId) || "mainnet");
  const [report, setReport] = useState<AccountAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examples, setExamples] = useState<ActiveAccount[] | null>(null);
  const [finding, setFinding] = useState(false);

  const analyse = useCallback(async (address: string, net: NetworkId) => {
    if (!ADDRESS_RE.test(address)) {
      setError("Enter a full 0x address (42 characters).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const info = makeInfoClient(net);
      const [account, markets] = await Promise.all([readAccount(info, address as `0x${string}`, "xyz"), loadMarkets(info, "xyz")]);
      // Typical funding only for the commodity/FX positions we explain in detail.
      await Promise.all(
        account.positions
          .filter((p) => EXPOSURES.some((e) => e.instruments.some((i) => i.coin === p.coin)))
          .map(async (p) => {
            const v = await typicalFunding(info, p.coin).catch(() => undefined);
            const m = markets.get(p.coin);
            if (m && v !== undefined) markets.set(p.coin, { ...m, fundingHourlyTypical: v });
          }),
      );
      setReport(assessAccount(account, markets));
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Analyse whatever is in the URL, so links to /watch?address=… are shareable.
  useEffect(() => {
    const a = params.get("address");
    const n = (params.get("network") as NetworkId) || "mainnet";
    if (a) {
      setInput(a);
      setNetwork(n);
      void analyse(a, n);
    }
  }, [params, analyse]);

  function submit(address = input.trim()) {
    router.replace(`/watch?address=${address}&network=${network}`, { scroll: false });
  }

  async function findExamples() {
    setFinding(true);
    try {
      setExamples(await findActiveAccounts(makeInfoClient(network), EXAMPLE_COINS, 8));
    } catch {
      setExamples([]);
    } finally {
      setFinding(false);
    }
  }

  const catalog = report?.positions.filter((p) => p.inCatalog) ?? [];
  const other = report?.positions.filter((p) => !p.inCatalog) ?? [];

  return (
    <div className="pt-10">
      <h1 className="font-serif text-3xl font-semibold">Watch any account</h1>
      <p className="mt-1 max-w-2xl text-ink-2">
        Paste a Hyperliquid address to see its commodity and FX positions the way Keel sees them: liquidation risk, what the
        guardian would do, and which real-world costs they cover. Read-only, public on-chain data.
      </p>

      <form
        className="mt-6 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="field num min-w-0 flex-1 basis-80"
          placeholder="0x…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Hyperliquid address"
          spellCheck={false}
        />
        <select className="field !w-auto" value={network} onChange={(e) => setNetwork(e.target.value as NetworkId)} aria-label="Network">
          <option value="mainnet">Mainnet</option>
          <option value="testnet">Testnet</option>
        </select>
        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Reading…" : "Analyse"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button className="text-accent underline-offset-2 hover:underline" onClick={findExamples} disabled={finding}>
          {finding ? "Searching recent trades…" : "Find accounts trading commodities right now"}
        </button>
        {examples?.length === 0 && <span className="text-muted">No recent trades found.</span>}
        {examples?.map((a) => (
          <button
            key={a.address}
            onClick={() => {
              setInput(a.address);
              submit(a.address);
            }}
            className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs hover:border-accent"
            title={a.address}
          >
            <span className="num">{shortAddr(a.address)}</span>
            <span className="text-muted"> · {a.coins.map(ticker).join(", ")}</span>
          </button>
        ))}
      </div>

      {error && <div className="mt-6 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</div>}

      {report && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi k="HIP-3 account value" v={usd(report.account.accountValueUsd ?? 0, { compact: true })} />
            <Kpi k="Position value" v={usd(report.notionalUsd, { compact: true })} />
            <Kpi k="Commodity & FX" v={String(catalog.length)} sub={other.length ? `+${other.length} other HIP-3` : undefined} />
            <Kpi
              k="Needs attention"
              v={String(report.atRisk)}
              sub="within 25% of liquidation, all HIP-3"
              tone={report.atRisk ? "bad" : "good"}
            />
          </div>

          {catalog.length === 0 ? (
            <div className="card mt-6 p-8 text-center text-ink-2">
              No commodity or FX positions on this account right now.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {catalog.map((p) => (
                <PositionCard key={p.position.coin} a={p} />
              ))}
            </div>
          )}

          {other.length > 0 && (
            <details className="card mt-4 p-5 text-sm">
              <summary className="cursor-pointer font-medium">Other HIP-3 positions ({other.length})</summary>
              <table className="mt-3 w-full">
                <tbody className="num">
                  {other.map((p) => (
                    <tr key={p.position.coin} className="border-t border-line">
                      <td className="py-1.5 font-sans">{ticker(p.position.coin)}</td>
                      <td className="py-1.5">{p.position.side === 1 ? "long" : "short"}</td>
                      <td className="py-1.5 text-right">{usd(p.notionalUsd, { compact: true })}</td>
                      <td className="py-1.5 text-right text-muted">{Number.isFinite(p.distance) ? pct(p.distance, 0) : "—"} to liq.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function PositionCard({ a }: { a: PositionAssessment }) {
  const p = a.position;
  const eq = a.equivalents[0];
  const tone =
    a.status === "critical" ? "bg-bad-soft text-bad" : a.status === "watch" ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2";
  return (
    <article className="card p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{instrumentLabel(p.coin)}</h3>
          <p className="text-sm text-muted">
            {p.side === 1 ? "Long" : "Short"} {qty(p.size, 2)} · {p.leverage}x {p.marginMode}
          </p>
        </div>
        <div className="text-right">
          <div className="num text-lg">{usd(p.size * p.markPx, { compact: true })}</div>
          <div className={`num text-xs ${p.unrealizedPnlUsd >= 0 ? "text-good" : "text-bad"}`}>
            {usd(p.unrealizedPnlUsd, { sign: true, compact: true })} unrealised
          </div>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Entry</dt>
          <dd className="num">{price(p.entryPx)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Mark</dt>
          <dd className="num">{price(p.markPx)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Carry / yr</dt>
          <dd className="num">{a.carryApr === null ? "—" : pct(a.carryApr, 1, true)}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <HealthBar distance={a.status === "no-liquidation" ? Infinity : a.distance} />
      </div>

      {eq && (
        <p className="mt-4 text-sm text-ink-2">
          Business equivalent: protects {eq.direction === "buy" ? "purchases" : "sales"} of{" "}
          <span className="num font-medium text-ink">{qty(eq.qty, eq.qty < 100 ? 1 : 0)}</span> {eq.unitLabel} of{" "}
          {eq.label.toLowerCase()}.
        </p>
      )}
      <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${tone}`}>
        <span className="font-semibold">Guardian: </span>
        {a.recommendation}
      </p>
      {eq && (
        <Link href={`/hedge?e=${eq.exposureId}`} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
          Plan a {eq.label.toLowerCase()} hedge like this →
        </Link>
      )}
    </article>
  );
}

function Kpi({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{k}</div>
      <div className={`num mt-1 text-2xl ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{v}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}
