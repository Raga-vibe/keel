"use client";

import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import {
  catalogCoins,
  defaultConfig,
  evaluateGuardian,
  getOnboardingStatus,
  LiveVenue,
  loadMarkets,
  makeInfoClient,
  PaperVenue,
  recordFromPlan,
  runGuardianActions,
  typicalFunding,
  type AccountState,
  type ExecutionMode,
  type ExecutionResult,
  type GuardianAction,
  type HedgePlan,
  type HedgeRecord,
  type KeelConfig,
  type MarketSnapshot,
  type NetworkId,
  type OnboardingStatus,
  type Venue,
} from "@keel/hedge-sdk";
import { privateKeyToAccount } from "viem/accounts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { readJson, safeStorage, writeJson } from "./storage";
import { connectInjected, loadAgent, type AgentKey, type ConnectedWallet } from "./wallet";

export type Mode = "paper" | "live";

/** Paper-mode identity when no wallet is connected. */
export const DEMO_USER = "0x00000000000000000000000000000000000000d0" as const;

const BUILDER = (process.env.NEXT_PUBLIC_KEEL_BUILDER || undefined) as `0x${string}` | undefined;

export interface SimState {
  /** Fast-forward for paper demos, in ms. */
  clockOffsetMs: number;
  /** Simulated price moves per coin, e.g. { "xyz:BRENTOIL": 0.25 }. */
  shocks: Record<string, number>;
}

export interface GuardianLogEntry {
  at: number;
  action: GuardianAction;
  ok: boolean;
  detail?: string;
}

interface KeelContextValue {
  mode: Mode;
  setMode(m: Mode): void;
  network: NetworkId;
  setNetwork(n: NetworkId): void;
  config: KeelConfig;
  markets: Map<string, MarketSnapshot> | null;
  marketsError: string | null;
  wallet: ConnectedWallet | null;
  walletError: string | null;
  connect(): Promise<void>;
  disconnect(): void;
  user: `0x${string}`;
  agent: AgentKey | null;
  setAgent(a: AgentKey | null): void;
  venue: Venue | null;
  account: AccountState | null;
  onboarding: OnboardingStatus | null;
  refresh(): Promise<void>;
  hedges: HedgeRecord[];
  setHedges(updater: (h: HedgeRecord[]) => HedgeRecord[]): void;
  openHedge(plan: HedgePlan, execMode?: ExecutionMode): Promise<{ result: ExecutionResult; record?: HedgeRecord }>;
  sim: SimState;
  setSim(updater: (s: SimState) => SimState): void;
  now(): number;
  guardianLog: GuardianLogEntry[];
  pendingActions: GuardianAction[];
  runGuardian(): Promise<void>;
  autoGuardian: boolean;
  setAutoGuardian(v: boolean): void;
  userExchange(): ExchangeClient | null;
  resetPaper(): void;
}

const KeelContext = createContext<KeelContextValue | null>(null);

export function useKeel(): KeelContextValue {
  const ctx = useContext(KeelContext);
  if (!ctx) throw new Error("useKeel must be used inside <KeelProvider>");
  return ctx;
}

function applyShocks(markets: Map<string, MarketSnapshot>, shocks: Record<string, number>) {
  if (Object.keys(shocks).length === 0) return markets;
  const out = new Map(markets);
  for (const [coin, shock] of Object.entries(shocks)) {
    const m = out.get(coin);
    if (!m) continue;
    const f = 1 + shock;
    out.set(coin, { ...m, markPx: m.markPx * f, midPx: m.midPx * f, oraclePx: m.oraclePx * f });
  }
  return out;
}

export function KeelProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("paper");
  const [network, setNetworkState] = useState<NetworkId>("testnet");
  const [rawMarkets, setRawMarkets] = useState<Map<string, MarketSnapshot> | null>(null);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentKey | null>(null);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [hedges, setHedgesState] = useState<HedgeRecord[]>([]);
  const [sim, setSimState] = useState<SimState>({ clockOffsetMs: 0, shocks: {} });
  const [guardianLog, setGuardianLog] = useState<GuardianLogEntry[]>([]);
  const [pendingActions, setPendingActions] = useState<GuardianAction[]>([]);
  const [autoGuardian, setAutoGuardianState] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Restore preferences after mount (avoids SSR/client mismatch).
  useEffect(() => {
    const prefs = readJson<{ mode?: Mode; network?: NetworkId; auto?: boolean }>("keel:prefs", {});
    if (prefs.mode) setModeState(prefs.mode);
    if (prefs.network) setNetworkState(prefs.network);
    if (prefs.auto !== undefined) setAutoGuardianState(prefs.auto);
    setSimState(readJson<SimState>("keel:sim", { clockOffsetMs: 0, shocks: {} }));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) writeJson("keel:prefs", { mode, network, auto: autoGuardian });
  }, [hydrated, mode, network, autoGuardian]);

  // Paper mode prices come from mainnet so the simulation tracks the real market.
  const dataNetwork: NetworkId = mode === "paper" ? "mainnet" : network;
  const config = useMemo(() => defaultConfig(dataNetwork, BUILDER), [dataNetwork]);
  const info = useMemo(() => makeInfoClient(dataNetwork), [dataNetwork]);
  const user = (mode === "paper" ? (wallet?.address ?? DEMO_USER) : (wallet?.address ?? DEMO_USER)) as `0x${string}`;
  const simRef = useRef(sim);
  simRef.current = sim;
  const now = useCallback(() => Date.now() + (mode === "paper" ? simRef.current.clockOffsetMs : 0), [mode]);

  const markets = useMemo(
    () => (rawMarkets ? (mode === "paper" ? applyShocks(rawMarkets, sim.shocks) : rawMarkets) : null),
    [rawMarkets, mode, sim.shocks],
  );
  const marketsRef = useRef(markets);
  marketsRef.current = markets;

  // --- markets -------------------------------------------------------------
  const typicalCache = useRef(new Map<string, { at: number; v: number | undefined }>());
  const loadAllMarkets = useCallback(async () => {
    try {
      const m = await loadMarkets(info, "xyz", catalogCoins());
      // Median funding changes slowly; refresh it every 10 minutes.
      await Promise.all(
        [...m.keys()].map(async (coin) => {
          const key = `${dataNetwork}:${coin}`;
          const cached = typicalCache.current.get(key);
          if (!cached || Date.now() - cached.at > 600_000) {
            const v = await typicalFunding(info, coin).catch(() => undefined);
            typicalCache.current.set(key, { at: Date.now(), v });
          }
          const v = typicalCache.current.get(key)?.v;
          if (v !== undefined) m.set(coin, { ...m.get(coin)!, fundingHourlyTypical: v });
        }),
      );
      setRawMarkets(m);
      setMarketsError(null);
    } catch (err) {
      setMarketsError(err instanceof Error ? err.message : String(err));
    }
  }, [info, dataNetwork]);

  useEffect(() => {
    setRawMarkets(null);
    void loadAllMarkets();
    const id = setInterval(loadAllMarkets, 15_000);
    return () => clearInterval(id);
  }, [loadAllMarkets]);

  // --- agent ---------------------------------------------------------------
  useEffect(() => {
    setAgent(mode === "live" && wallet ? loadAgent(network, wallet.address) : null);
  }, [mode, network, wallet]);

  // --- venue ---------------------------------------------------------------
  const venue = useMemo<Venue | null>(() => {
    if (!hydrated) return null;
    if (mode === "paper") {
      return new PaperVenue({
        user,
        config,
        store: safeStorage,
        markets: async () => {
          if (marketsRef.current) return marketsRef.current;
          return applyShocks(await loadMarkets(info, "xyz", catalogCoins()), simRef.current.shocks);
        },
        now: () => Date.now() + simRef.current.clockOffsetMs,
      });
    }
    if (!wallet || !agent) return null;
    const exchange = new ExchangeClient({
      transport: new HttpTransport({ isTestnet: network === "testnet" }),
      wallet: privateKeyToAccount(agent.privateKey),
    });
    return new LiveVenue({ config, info, exchange, user: wallet.address });
  }, [hydrated, mode, user, config, info, wallet, agent, network]);

  // --- hedge book (per venue / network / user) --------------------------------
  // v2 pairs with the $1M paper account (keel:paper:v2).
  const bookKey = `keel:hedges:v2:${mode}:${dataNetwork}:${user.toLowerCase()}`;
  useEffect(() => {
    if (hydrated) setHedgesState(readJson<HedgeRecord[]>(bookKey, []));
  }, [hydrated, bookKey]);
  const hedgesRef = useRef(hedges);
  hedgesRef.current = hedges;
  const setHedges = useCallback(
    (updater: (h: HedgeRecord[]) => HedgeRecord[]) => {
      const next = updater(hedgesRef.current);
      hedgesRef.current = next;
      setHedgesState(next);
      writeJson(bookKey, next);
    },
    [bookKey],
  );

  // --- account + onboarding ---------------------------------------------------
  const refresh = useCallback(async () => {
    if (!venue) {
      setAccount(null);
    } else {
      try {
        const acct = await venue.getAccount();
        setAccount(acct);
        // Promote resting limit hedges once their fill shows up in the position.
        const pending = hedgesRef.current.filter((h) => h.status === "pending");
        if (pending.length) {
          setHedges((book) =>
            book.map((h) => {
              if (h.status !== "pending") return h;
              const pos = acct.positions.find((p) => p.coin === h.coin && p.side === h.side);
              if (!pos || pos.size < h.size * 0.99) return h;
              return {
                ...h,
                status: "open",
                entryPx: pos.entryPx,
                lockedPerUserUnit: h.inverseQuote ? null : pos.entryPx * h.toInstrument,
                events: [...h.events, { at: Date.now(), kind: "opened", message: `Limit order filled at ${pos.entryPx}` }],
              };
            }),
          );
        }
        const actions = evaluateGuardian({ account: acct, hedges: hedgesRef.current, now: now() });
        setPendingActions(actions);
      } catch (err) {
        console.warn("account refresh failed", err);
      }
    }
    if (mode === "live" && wallet) {
      try {
        setOnboarding(await getOnboardingStatus(info, config, wallet.address, agent?.address));
      } catch (err) {
        console.warn("onboarding check failed", err);
      }
    } else {
      setOnboarding(null);
    }
  }, [venue, mode, wallet, info, config, agent, setHedges, now]);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Re-evaluate right away when simulated prices or time change.
  useEffect(() => {
    if (mode === "paper") void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, markets]);

  // --- guardian --------------------------------------------------------------
  const running = useRef(false);
  const runGuardian = useCallback(async () => {
    if (!venue || running.current) return;
    running.current = true;
    try {
      const acct = await venue.getAccount();
      const at = now();
      const actions = evaluateGuardian({ account: acct, hedges: hedgesRef.current, now: at });
      if (actions.length === 0) return;
      const { hedges: updated, results } = await runGuardianActions(venue, actions, hedgesRef.current, at);
      setHedges(() => updated);
      setGuardianLog((log) =>
        [
          ...results.map((r) => ({ at: Date.now(), action: r.action, ok: r.ok, detail: r.error })),
          ...log,
        ].slice(0, 100),
      );
      await refresh();
    } finally {
      running.current = false;
    }
  }, [venue, now, setHedges, refresh]);

  const hasExecutable = pendingActions.some((a) => a.kind !== "alert");
  useEffect(() => {
    if (!autoGuardian || !hasExecutable) return;
    const id = setTimeout(() => void runGuardian(), 1500);
    return () => clearTimeout(id);
  }, [autoGuardian, hasExecutable, runGuardian]);

  // --- actions ------------------------------------------------------------------
  const openHedge = useCallback(
    async (plan: HedgePlan, execMode: ExecutionMode = "market") => {
      if (!venue) throw new Error(mode === "live" ? "Connect a wallet and approve the Keel agent first" : "Loading…");
      const result = await venue.openHedge(plan, execMode);
      if (result.status === "error") return { result };
      const record = recordFromPlan(plan, result, venue.kind, dataNetwork, now());
      setHedges((h) => [record, ...h]);
      await refresh();
      return { result, record };
    },
    [venue, mode, dataNetwork, now, setHedges, refresh],
  );

  const connect = useCallback(async () => {
    setWalletError(null);
    try {
      setWallet(await connectInjected());
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const userExchange = useCallback(() => {
    if (!wallet) return null;
    return new ExchangeClient({
      transport: new HttpTransport({ isTestnet: network === "testnet" }),
      wallet: wallet.client,
    });
  }, [wallet, network]);

  const setSim = useCallback((updater: (s: SimState) => SimState) => {
    setSimState((s) => {
      const next = updater(s);
      writeJson("keel:sim", next);
      return next;
    });
  }, []);

  const resetPaper = useCallback(() => {
    if (venue instanceof PaperVenue) venue.reset();
    setHedges(() => []);
    setSim(() => ({ clockOffsetMs: 0, shocks: {} }));
    setGuardianLog([]);
    void refresh();
  }, [venue, setHedges, setSim, refresh]);

  const value: KeelContextValue = {
    mode,
    setMode: setModeState,
    network,
    setNetwork: setNetworkState,
    config,
    markets,
    marketsError,
    wallet,
    walletError,
    connect,
    disconnect: () => setWallet(null),
    user,
    agent,
    setAgent,
    venue,
    account,
    onboarding,
    refresh,
    hedges,
    setHedges,
    openHedge,
    sim,
    setSim,
    now,
    guardianLog,
    pendingActions,
    runGuardian,
    autoGuardian,
    setAutoGuardian: setAutoGuardianState,
    userExchange,
    resetPaper,
  };

  return <KeelContext.Provider value={value}>{children}</KeelContext.Provider>;
}
