"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiHeaders, getBrowserApiBase } from "@/lib/client-api";

export function AlertActions({
  ruleId,
  enabled,
}: {
  ruleId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const API_URL = getBrowserApiBase();

  async function run(path: string, method = "POST") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: apiHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void run(
            enabled
              ? `/api/alerts/rules/${ruleId}/disable`
              : `/api/alerts/rules/${ruleId}/enable`,
          )
        }
        className="border border-[var(--line)] px-3 py-1.5 font-mono text-xs hover:bg-mist/40 disabled:opacity-50"
      >
        {enabled ? "Disable" : "Enable"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run("/api/alerts/evaluate")}
        className="border border-[var(--line)] px-3 py-1.5 font-mono text-xs hover:bg-mist/40 disabled:opacity-50"
      >
        Evaluate now
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!confirm("Delete this alert rule?")) return;
          setBusy(true);
          try {
            const res = await fetch(`${API_URL}/api/alerts/rules/${ruleId}`, {
              method: "DELETE",
              headers: apiHeaders(),
            });
            if (!res.ok && res.status !== 204) {
              throw new Error(`Delete failed (${res.status})`);
            }
            router.push("/alerts");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed");
          } finally {
            setBusy(false);
          }
        }}
        className="border border-critical/40 px-3 py-1.5 font-mono text-xs text-critical hover:bg-critical/10 disabled:opacity-50"
      >
        Delete
      </button>
      {error && <span className="font-mono text-xs text-critical">{error}</span>}
    </div>
  );
}
