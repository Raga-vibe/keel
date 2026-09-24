import type { Candle } from "@keel/hedge-sdk";

export function Sparkline({ candles, width = 120, height = 32 }: { candles: Candle[] | null; width?: number; height?: number }) {
  if (!candles || candles.length < 2) {
    return <div style={{ width, height }} className="rounded bg-surface-2/60" aria-hidden="true" />;
  }
  const closes = candles.map((c) => c.c);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const pts = closes.map((c, i) => `${(i / (closes.length - 1)) * width},${height - 2 - ((c - min) / span) * (height - 4)}`);
  const up = closes.at(-1)! >= closes[0]!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`30-day trend ${up ? "up" : "down"}`}>
      <polyline points={pts.join(" ")} fill="none" stroke={up ? "var(--good)" : "var(--bad)"} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
