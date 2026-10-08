"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiHeaders, getBrowserApiBase } from "@/lib/client-api";

export function SimulateIncidentButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const API_URL = getBrowserApiBase();

  async function toggle(enable: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/demo/simulate-incident`, {
        method: enable ? "POST" : "DELETE",
        headers: apiHeaders(),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setMsg(
        enable
          ? "Payment chaos ON — generate traffic, wait for alerts to fire."
          : "Payment chaos OFF",
      );
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggle(true)}
        className="bg-critical px-4 py-2 font-mono text-sm text-paper hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Working…" : "Simulate incident"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggle(false)}
        className="border border-[var(--line)] px-3 py-1.5 font-mono text-xs hover:bg-mist/40 disabled:opacity-50"
      >
        Clear simulation
      </button>
      {msg && <span className="font-mono text-xs text-ink/55">{msg}</span>}
    </div>
  );
}
