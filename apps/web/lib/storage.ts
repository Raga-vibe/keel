import type { KeyValueStore } from "@keel/hedge-sdk";

/** localStorage that never throws (private windows, blocked storage, SSR). */
export const safeStorage: KeyValueStore & { remove(key: string): void } = {
  get(key) {
    try {
      return typeof window === "undefined" ? null : window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: state lives for this session only */
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export function readJson<T>(key: string, fallback: T): T {
  const raw = safeStorage.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  safeStorage.set(key, JSON.stringify(value));
}
