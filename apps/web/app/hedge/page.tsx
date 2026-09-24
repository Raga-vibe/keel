"use client";

import { EXPOSURES, getExposure, planHedge, type ExposureCategory, type ExposureInput, type HedgePlan } from "@keel/hedge-sdk";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ExecutePanel } from "@/components/hedge/ExecutePanel";
import { PlanPanel } from "@/components/hedge/PlanPanel";
import { directionLabels, FREQUENCIES, initialForm, PRESETS, type FormState } from "@/components/hedge/presets";
import { useKeel } from "@/lib/keel";

const CATEGORIES: { id: ExposureCategory; label: string }[] = [
  { id: "energy", label: "Energy" },
  { id: "metals", label: "Metals" },
  { id: "fx", label: "Currency" },
];

export default function HedgePage() {
  return (
    <Suspense fallback={null}>
      <Wizard />
    </Suspense>
  );
}

function Wizard() {
  const params = useSearchParams();
  const router = useRouter();
  const { markets, config, now, mode } = useKeel();
  const initialId = params.get("e") && PRESETS[params.get("e")!] ? params.get("e")! : "diesel";
  const [form, setForm] = useState<FormState>(() => initialForm(initialId, params.get("i") ?? undefined, now()));

  useEffect(() => {
    const e = params.get("e");
    if (e && PRESETS[e] && e !== form.exposureId) setForm(initialForm(e, params.get("i") ?? undefined, now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const exposure = getExposure(form.exposureId);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const { plan, error } = useMemo((): { plan: HedgePlan | null; error: string | null } => {
    if (!markets) return { plan: null, error: null };
    const quantity = Number(form.quantity.replace(/,/g, ""));
    if (!Number.isFinite(quantity) || quantity <= 0) return { plan: null, error: "Enter a quantity above zero." };
    const input: ExposureInput = {
      exposureId: form.exposureId,
      unitId: form.unitId,
      quantity,
      frequency: form.frequency,
      periods: form.frequency === "once" ? 1 : form.periods,
      direction: form.direction,
      hedgeRatio: form.hedgeRatio,
      instrumentCoin: form.instrumentCoin,
      leverage: form.leverage,
      label: form.label || undefined,
      firstSettlement: form.frequency === "once" ? Date.parse(`${form.settleDate}T12:00:00Z`) : undefined,
      localPricePerUnit: Number(form.localPrice) || undefined,
    };
    try {
      return { plan: planHedge(input, markets, { config, now: now() }), error: null };
    } catch (err) {
      return { plan: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [form, markets, config, now]);

  const [buyLabel, sellLabel] = directionLabels(exposure.category, exposure.units[0]?.id);
  const freqNoun = FREQUENCIES.find((f) => f.id === form.frequency)?.noun ?? "";

  function pick(id: string) {
    setForm(initialForm(id, undefined, now()));
    router.replace(`/hedge?e=${id}`, { scroll: false });
  }

  return (
    <div className="pt-10">
      <h1 className="font-serif text-3xl font-semibold">New hedge</h1>
      <p className="mt-1 text-ink-2">
        Tell Keel what your business buys or sells. The plan updates live from Hyperliquid prices.
        {mode === "paper" && " You're in paper mode: nothing real is traded."}
      </p>

      {/* Step 1: exposure */}
      <section className="mt-8">
        <h2 className="label mb-3">1 · What do you want to protect?</h2>
        <div className="space-y-3">
          {CATEGORIES.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-sm text-muted">{c.label}</span>
              {EXPOSURES.filter((e) => e.category === c.id).map((e) => (
                <button
                  key={e.id}
                  onClick={() => pick(e.id)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    e.id === form.exposureId
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-line-strong bg-surface hover:border-accent"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">Typical users: {exposure.whoHasIt}.</p>
      </section>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Step 2: details */}
        <section className="card space-y-5 p-5 lg:sticky lg:top-20">
          <h2 className="label">2 · Your exposure</h2>

          <div className="seg w-full">
            <button className="flex-1" aria-pressed={form.direction === "buy"} onClick={() => set("direction", "buy")}>
              {buyLabel}
            </button>
            <button className="flex-1" aria-pressed={form.direction === "sell"} onClick={() => set("direction", "sell")}>
              {sellLabel}
            </button>
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="qty">
              {form.frequency === "once" ? "Amount" : "Amount each period"}
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="qty"
                className="field num"
                inputMode="decimal"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
              />
              <select className="field !w-auto" value={form.unitId} onChange={(e) => set("unitId", e.target.value)} aria-label="Unit">
                {exposure.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium" htmlFor="freq">
                How often
              </label>
              <select
                id="freq"
                className="field mt-1.5"
                value={form.frequency}
                onChange={(e) => set("frequency", e.target.value as FormState["frequency"])}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            {form.frequency === "once" ? (
              <div>
                <label className="text-sm font-medium" htmlFor="date">
                  Payment date
                </label>
                <input id="date" type="date" className="field mt-1.5" value={form.settleDate} onChange={(e) => set("settleDate", e.target.value)} />
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium" htmlFor="periods">
                  For the next
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="periods"
                    type="number"
                    min={1}
                    max={24}
                    className="field num"
                    value={form.periods}
                    onChange={(e) => set("periods", Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
                  />
                  <span className="text-sm text-muted">{freqNoun}</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" htmlFor="ratio">
                How much to protect
              </label>
              <span className="num text-sm">{Math.round(form.hedgeRatio * 100)}%</span>
            </div>
            <input
              id="ratio"
              type="range"
              min={10}
              max={100}
              step={5}
              className="mt-2 w-full"
              value={form.hedgeRatio * 100}
              onChange={(e) => set("hedgeRatio", Number(e.target.value) / 100)}
            />
            <p className="text-xs text-muted">Most businesses hedge 50–80%, keeping some upside if prices fall.</p>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer font-medium">More options</summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-sm" htmlFor="label">
                  Name
                </label>
                <input
                  id="label"
                  className="field mt-1"
                  placeholder={`${exposure.label} hedge`}
                  value={form.label}
                  onChange={(e) => set("label", e.target.value)}
                />
              </div>
              {exposure.category !== "fx" && (
                <div>
                  <label className="text-sm" htmlFor="local">
                    What you pay today per {exposure.units.find((u) => u.id === form.unitId)?.label.replace(/s$/, "")} (USD, optional)
                  </label>
                  <input
                    id="local"
                    className="field num mt-1"
                    inputMode="decimal"
                    placeholder="e.g. 1.05"
                    value={form.localPrice}
                    onChange={(e) => set("localPrice", e.target.value)}
                  />
                </div>
              )}
              {exposure.instruments.length > 1 && (
                <div>
                  <label className="text-sm" htmlFor="inst">
                    Benchmark
                  </label>
                  <select
                    id="inst"
                    className="field mt-1"
                    value={form.instrumentCoin ?? exposure.instruments[0]!.coin}
                    onChange={(e) => set("instrumentCoin", e.target.value)}
                  >
                    {exposure.instruments.map((i) => (
                      <option key={i.coin} value={i.coin}>
                        {i.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm" htmlFor="lev">
                    Leverage
                  </label>
                  <span className="num">{form.leverage ? `${form.leverage}x` : `auto (${plan?.leverage ?? 2}x)`}</span>
                </div>
                <input
                  id="lev"
                  type="range"
                  min={1}
                  max={10}
                  className="mt-1 w-full"
                  value={form.leverage ?? plan?.leverage ?? 2}
                  onChange={(e) => set("leverage", Number(e.target.value))}
                />
                <p className="text-xs text-muted">Lower leverage needs more cash upfront but survives bigger moves.</p>
              </div>
            </div>
          </details>
        </section>

        {/* Step 3: plan */}
        <section className="space-y-4">
          <h2 className="label">3 · Your plan</h2>
          {error && <div className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</div>}
          {!markets && !error && <div className="card h-96 animate-pulse" />}
          {plan && (
            <>
              <PlanPanel plan={plan} localPrice={Number(form.localPrice) || undefined} />
              <ExecutePanel plan={plan} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
