export function usd(n: number, opts: { cents?: boolean; sign?: boolean; compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const body = opts.compact && abs >= 10_000
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(abs)
    : abs.toLocaleString("en-US", {
        minimumFractionDigits: opts.cents ? 2 : 0,
        maximumFractionDigits: opts.cents || abs < 100 ? 2 : 0,
      });
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  return `${sign}$${body}`;
}

export function pct(n: number, digits = 1, sign = false): string {
  if (!Number.isFinite(n)) return "—";
  const s = (Math.abs(n) * 100).toFixed(digits);
  return `${n < 0 ? "−" : sign && n > 0 ? "+" : ""}${s}%`;
}

/** Price with sensible precision for its magnitude. */
export function price(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 1 : abs >= 100 ? 2 : abs >= 10 ? 3 : abs >= 1 ? 4 : 5;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function qty(n: number, maxDigits = 2): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: maxDigits });
}

export function date(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function time(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Hourly funding → annualised rate. */
export function fundingApr(hourly: number): number {
  return hourly * 24 * 365;
}

/** "xyz:BRENTOIL" → "BRENTOIL" */
export function ticker(coin: string): string {
  return coin.includes(":") ? coin.split(":")[1]! : coin;
}
