"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiHeaders, getBrowserApiBase } from "@/lib/client-api";

export function EvaluateAllClient() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const API_URL = getBrowserApiBase();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const res = await fetch(`${API_URL}/api/alerts/evaluate`, {
              method: "POST",
              headers: apiHeaders(),
            });
            if (!res.ok) throw new Error(`Evaluate failed (${res.status})`);
            const body = (await res.json()) as {
              results: Array<{ status: string }>;
            };
            const firing = body.results.filter((r) => r.status === "firing").length;
            setMsg(`Evaluated ${body.results.length} samples · ${firing} firing`);
            router.refresh();
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Evaluate failed");
          } finally {
            setBusy(false);
          }
        }}
        className="border border-[var(--line)] px-3 py-1.5 font-mono text-xs hover:bg-mist/40 disabled:opacity-50"
      >
        {busy ? "Evaluating…" : "Run evaluation now"}
      </button>
      {msg && <span className="font-mono text-xs text-ink/50">{msg}</span>}
    </div>
  );
}
