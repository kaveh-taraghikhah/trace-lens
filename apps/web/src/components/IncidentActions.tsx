"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiHeaders, getBrowserApiBase } from "@/lib/client-api";

export function IncidentActions({
  incidentId,
  status,
}: {
  incidentId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const API_URL = getBrowserApiBase();

  async function post(path: string, body?: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: apiHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function onNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await post(`/api/incidents/${incidentId}/notes`, {
      note: note.trim(),
      actor: "operator",
    });
    setNote("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {status !== "acknowledged" && status !== "resolved" && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void post(`/api/incidents/${incidentId}/acknowledge`, {
                actor: "operator",
              })
            }
            className="border border-[var(--line)] px-3 py-1.5 font-mono text-xs hover:bg-mist/40 disabled:opacity-50"
          >
            Acknowledge
          </button>
        )}
        {status !== "resolved" && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void post(`/api/incidents/${incidentId}/resolve`, {
                actor: "operator",
              })
            }
            className="border border-critical/40 px-3 py-1.5 font-mono text-xs text-critical hover:bg-critical/10 disabled:opacity-50"
          >
            Resolve
          </button>
        )}
      </div>

      {status !== "resolved" && (
        <form onSubmit={onNote} className="flex flex-wrap gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add investigation note…"
            className="min-w-[240px] flex-1 border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
          />
          <button
            type="submit"
            disabled={busy || !note.trim()}
            className="bg-accent px-3 py-2 font-mono text-xs text-paper hover:opacity-90 disabled:opacity-50"
          >
            Add note
          </button>
        </form>
      )}

      {error && <p className="font-mono text-xs text-critical">{error}</p>}
    </div>
  );
}
