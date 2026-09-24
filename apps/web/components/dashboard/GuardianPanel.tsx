"use client";

import type { GuardianAction } from "@keel/hedge-sdk";
import { useState } from "react";
import { time, ticker, usd } from "@/lib/format";
import { useKeel } from "@/lib/keel";

function describe(a: GuardianAction): string {
  switch (a.kind) {
    case "add-margin":
      return `Add ${usd(a.amountUsd)} margin to ${ticker(a.coin)}. ${a.reason}`;
    case "reduce":
      return `Reduce ${ticker(a.coin)} by ${a.size.toFixed(4)}. ${a.reason}`;
    case "settle":
      return `Close ${a.size.toFixed(4)} ${ticker(a.coin)}. ${a.reason}`;
    case "alert":
      return a.message;
  }
}

const TONE: Record<string, string> = {
  "add-margin": "bg-warn-soft text-warn",
  reduce: "bg-bad-soft text-bad",
  settle: "bg-accent-soft text-accent",
  info: "bg-surface-2 text-ink-2",
  warning: "bg-warn-soft text-warn",
  critical: "bg-bad-soft text-bad",
};

export function GuardianPanel() {
  const { pendingActions, guardianLog, runGuardian, autoGuardian, setAutoGuardian, mode, hedges } = useKeel();
  const [busy, setBusy] = useState(false);
  const executable = pendingActions.filter((a) => a.kind !== "alert");
  const open = hedges.filter((h) => h.status === "open").length;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-semibold">Guardian</h2>
          <p className="text-sm text-muted">
            Watches {open} open hedge{open === 1 ? "" : "s"}: tops up margin at 25% from liquidation, releases slices on schedule.
          </p>
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoGuardian} onChange={(e) => setAutoGuardian(e.target.checked)} />
          Act automatically{mode === "live" ? " while this tab is open" : ""}
        </label>
        <button
          className="btn btn-ghost !py-1.5 text-sm"
          disabled={busy || executable.length === 0}
          onClick={async () => {
            setBusy(true);
            await runGuardian();
            setBusy(false);
          }}
        >
          {busy ? "Running…" : `Run now${executable.length ? ` (${executable.length})` : ""}`}
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {pendingActions.length === 0 && <li className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">All hedges healthy. Nothing to do.</li>}
        {pendingActions.map((a, i) => (
          <li key={i} className={`rounded-lg px-3 py-2 text-sm ${TONE[a.kind === "alert" ? a.level : a.kind]}`}>
            <span className="font-semibold capitalize">{a.kind === "alert" ? a.level : a.kind.replace("-", " ")}:</span> {describe(a)}
          </li>
        ))}
      </ul>

      {guardianLog.length > 0 && (
        <details className="mt-4 text-sm" open>
          <summary className="cursor-pointer text-muted">Recent actions</summary>
          <ol className="mt-2 space-y-1">
            {guardianLog.slice(0, 12).map((l, i) => (
              <li key={i} className="flex gap-3">
                <span className="num shrink-0 text-xs text-muted">{time(l.at)}</span>
                <span className={l.ok ? "text-ink-2" : "text-bad"}>
                  {l.ok ? "✓" : "✗"} {describe(l.action)} {l.detail ? `(${l.detail})` : ""}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {mode === "live" && (
        <p className="mt-4 text-xs text-muted">
          To keep hedges protected with this tab closed, run the open-source keeper (<code>npm run keeper</code>) with the
          exported hedge book and agent key.
        </p>
      )}
    </section>
  );
}
