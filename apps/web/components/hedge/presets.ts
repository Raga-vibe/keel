import type { ExposureCategory, Frequency } from "@keel/hedge-sdk";

export interface FormState {
  exposureId: string;
  direction: "buy" | "sell";
  quantity: string;
  unitId: string;
  frequency: Frequency;
  periods: number;
  hedgeRatio: number;
  instrumentCoin?: string;
  leverage?: number;
  label: string;
  /** yyyy-mm-dd for one-off exposures */
  settleDate: string;
  localPrice: string;
}

type Preset = Pick<FormState, "quantity" | "unitId" | "frequency" | "periods">;

export const PRESETS: Record<string, Preset> = {
  diesel: { quantity: "40000", unitId: "L", frequency: "monthly", periods: 6 },
  gasoline: { quantity: "20000", unitId: "L", frequency: "monthly", periods: 6 },
  jetfuel: { quantity: "100000", unitId: "L", frequency: "monthly", periods: 3 },
  crude: { quantity: "1000", unitId: "bbl", frequency: "monthly", periods: 3 },
  natgas: { quantity: "10000", unitId: "MMBtu", frequency: "monthly", periods: 6 },
  gold: { quantity: "500", unitId: "g", frequency: "monthly", periods: 6 },
  silver: { quantity: "10", unitId: "kg", frequency: "monthly", periods: 6 },
  platinum: { quantity: "50", unitId: "ozt", frequency: "quarterly", periods: 4 },
  palladium: { quantity: "20", unitId: "ozt", frequency: "quarterly", periods: 4 },
  copper: { quantity: "2", unitId: "t", frequency: "monthly", periods: 6 },
  eur: { quantity: "250000", unitId: "EUR", frequency: "once", periods: 1 },
  gbp: { quantity: "150000", unitId: "GBP", frequency: "once", periods: 1 },
  jpy: { quantity: "20000000", unitId: "JPY", frequency: "once", periods: 1 },
};

export function isoDateIn(days: number, base = Date.now()): string {
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

export function initialForm(exposureId: string, instrumentCoin?: string, base = Date.now()): FormState {
  const p = PRESETS[exposureId] ?? PRESETS.diesel!;
  return {
    exposureId,
    direction: "buy",
    ...p,
    hedgeRatio: 0.75,
    instrumentCoin,
    leverage: undefined,
    label: "",
    settleDate: isoDateIn(90, base),
    localPrice: "",
  };
}

export function directionLabels(category: ExposureCategory, currency?: string): [string, string] {
  if (category === "fx") return [`I pay in ${currency}`, `I get paid in ${currency}`];
  return ["I buy it", "I produce or sell it"];
}

export const FREQUENCIES: { id: Frequency; label: string; noun: string }[] = [
  { id: "weekly", label: "Weekly", noun: "weeks" },
  { id: "monthly", label: "Monthly", noun: "months" },
  { id: "quarterly", label: "Quarterly", noun: "quarters" },
  { id: "once", label: "One-off", noun: "" },
];
