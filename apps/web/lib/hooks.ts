"use client";

import { loadCandles, makeInfoClient, type Candle, type NetworkId } from "@keel/hedge-sdk";
import { useEffect, useState } from "react";

const cache = new Map<string, { at: number; data: Candle[] }>();

export function useCandles(coin: string | undefined, network: NetworkId, days = 30, interval: "1h" | "4h" | "1d" = "1d") {
  const [data, setData] = useState<Candle[] | null>(null);
  useEffect(() => {
    if (!coin) return;
    const key = `${network}:${coin}:${days}:${interval}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 300_000) {
      setData(hit.data);
      return;
    }
    let alive = true;
    loadCandles(makeInfoClient(network), coin, interval, days)
      .then((d) => {
        cache.set(key, { at: Date.now(), data: d });
        if (alive) setData(d);
      })
      .catch(() => alive && setData([]));
    return () => {
      alive = false;
    };
  }, [coin, network, days, interval]);
  return data;
}
