"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  apiHeaders,
  getBrowserApiBase,
  getStoredApiKey,
  setStoredApiKey,
} from "@/lib/client-api";

type PlatformStatus = {
  authMode: string;
  role: string;
  actor: string;
  sampling: {
    errorsPct: number;
    slowPct: number;
    normalPct: number;
    slowThresholdMs: number;
  } | null;
  retention: { tracesHours: number; logsHours: number } | null;
  cardinality: { allowed: string[]; forbidden: string[] } | null;
  rateLimit: { max: number; timeWindow: string };
};

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  role: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
};

export function SettingsClient({
  initialStatus,
}: {
  initialStatus: PlatformStatus | null;
}) {
  const router = useRouter();
  const api = getBrowserApiBase();
  const [status, setStatus] = useState(initialStatus);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [localKey, setLocalKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("CI deployer");
  const [newKeyRole, setNewKeyRole] = useState("operator");
  const [createdPlaintext, setCreatedPlaintext] = useState<string | null>(null);
  const [cardLabels, setCardLabels] = useState("service,user_id,order_id,region");
  const [cardResult, setCardResult] = useState<
    Array<{ label: string; status: string; reason: string | null }>
  >([]);

  useEffect(() => {
    setLocalKey(getStoredApiKey() ?? "");
  }, []);

  async function refresh() {
    const headers = apiHeaders();
    const [st, ks, au] = await Promise.all([
      fetch(`${api}/api/platform/status`, { headers }).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`${api}/api/platform/keys`, { headers }).then((r) =>
        r.ok ? r.json() : { keys: [] },
      ),
      fetch(`${api}/api/platform/audit?limit=30`, { headers }).then((r) =>
        r.ok ? r.json() : { entries: [] },
      ),
    ]);
    if (st) setStatus(st);
    setKeys(ks.keys ?? []);
    setAudit(au.entries ?? []);
    router.refresh();
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveLocalKey(e: FormEvent) {
    e.preventDefault();
    setStoredApiKey(localKey.trim() || null);
    setMsg(localKey.trim() ? "API key saved in this browser." : "API key cleared.");
    await refresh();
  }

  async function createKey(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch(`${api}/api/platform/keys`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ name: newKeyName, role: newKeyRole }),
    });
    const body = await res.json();
    if (!res.ok) {
      setMsg(body?.error ?? `Create failed (${res.status})`);
      return;
    }
    setCreatedPlaintext(body.plaintext);
    setMsg("Key created — copy plaintext now.");
    await refresh();
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key?")) return;
    const res = await fetch(`${api}/api/platform/keys/${id}`, {
      method: "DELETE",
      headers: apiHeaders(),
    });
    if (!res.ok && res.status !== 204) {
      setMsg(`Revoke failed (${res.status})`);
      return;
    }
    setMsg("Key revoked.");
    await refresh();
  }

  async function saveSampling(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      sampleErrorsPct: Number(fd.get("sampleErrorsPct")),
      sampleSlowPct: Number(fd.get("sampleSlowPct")),
      sampleNormalPct: Number(fd.get("sampleNormalPct")),
      slowThresholdMs: Number(fd.get("slowThresholdMs")),
      retentionTracesHours: Number(fd.get("retentionTracesHours")),
      retentionLogsHours: Number(fd.get("retentionLogsHours")),
    };
    const res = await fetch(`${api}/api/platform/settings`, {
      method: "PATCH",
      headers: apiHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setMsg(`Settings update failed (${res.status})`);
      return;
    }
    setMsg("Sampling / retention targets saved (DB only — see note above).");
    await refresh();
  }

  async function checkCardinality(e: FormEvent) {
    e.preventDefault();
    const res = await fetch(
      `${api}/api/platform/cardinality/check?labels=${encodeURIComponent(cardLabels)}`,
      { headers: apiHeaders() },
    );
    const body = await res.json();
    if (!res.ok) {
      setMsg(`Cardinality check failed (${res.status})`);
      return;
    }
    setCardResult(body.results ?? []);
  }

  return (
    <div className="space-y-10">
      {msg && (
        <p className="font-mono text-sm text-ink/60" role="status">
          {msg}
        </p>
      )}

      <section className="border border-[var(--line)] bg-paper/70 p-5">
        <h2 className="font-display text-xl font-bold">Session API key</h2>
        <p className="mt-1 font-mono text-xs text-ink/45">
          Stored in localStorage as <code>X-API-Key</code>. Required when{" "}
          <code>TRACELENS_AUTH_MODE=api_key</code>. Demo admin:{" "}
          <code>tl_live_demo_ecommerce_admin_key_0001</code>
        </p>
        <form onSubmit={saveLocalKey} className="mt-4 flex flex-wrap gap-2">
          <input
            value={localKey}
            onChange={(e) => setLocalKey(e.target.value)}
            className="min-w-[280px] flex-1 border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
            placeholder="tl_live_…"
          />
          <button
            type="submit"
            className="bg-accent px-3 py-2 font-mono text-xs text-paper"
          >
            Save
          </button>
        </form>
        {status && (
          <p className="mt-3 font-mono text-xs text-ink/50">
            mode={status.authMode} · role={status.role} · actor={status.actor} ·
            rate {status.rateLimit.max}/{status.rateLimit.timeWindow}
          </p>
        )}
      </section>

      <section className="border border-[var(--line)] bg-paper/70 p-5">
        <h2 className="font-display text-xl font-bold">API keys</h2>
        <form onSubmit={createKey} className="mt-4 flex flex-wrap gap-2">
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
          />
          <select
            value={newKeyRole}
            onChange={(e) => setNewKeyRole(e.target.value)}
            className="border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
          >
            <option value="viewer">viewer</option>
            <option value="operator">operator</option>
            <option value="admin">admin</option>
          </select>
          <button
            type="submit"
            className="bg-accent px-3 py-2 font-mono text-xs text-paper"
          >
            Create key
          </button>
        </form>
        {createdPlaintext && (
          <p className="mt-3 break-all border border-critical/30 bg-critical/5 px-3 py-2 font-mono text-xs text-critical">
            {createdPlaintext}
          </p>
        )}
        <ul className="mt-4 space-y-2">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs"
            >
              <span>
                {k.name} · {k.role} · {k.keyPrefix}…{" "}
                {k.revokedAt ? (
                  <span className="text-ink/40">revoked</span>
                ) : (
                  <span className="text-healthy">active</span>
                )}
              </span>
              {!k.revokedAt && (
                <button
                  type="button"
                  onClick={() => void revokeKey(k.id)}
                  className="text-critical hover:underline"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-[var(--line)] bg-paper/70 p-5">
        <h2 className="font-display text-xl font-bold">
          Sampling & retention
        </h2>
        <p className="mt-1 font-mono text-xs text-ink/45">
          Saved in Postgres as targets only — the running Collector does not
          pick these up automatically. Apply{" "}
          <code>observability/otel-collector/tail-sampling.example.yaml</code>{" "}
          yourself if you want them live.
        </p>
        <form onSubmit={saveSampling} className="mt-4 grid gap-3 md:grid-cols-3">
          <Field
            label="Errors %"
            name="sampleErrorsPct"
            defaultValue={status?.sampling?.errorsPct ?? 100}
          />
          <Field
            label="Slow %"
            name="sampleSlowPct"
            defaultValue={status?.sampling?.slowPct ?? 100}
          />
          <Field
            label="Normal %"
            name="sampleNormalPct"
            defaultValue={status?.sampling?.normalPct ?? 10}
          />
          <Field
            label="Slow threshold ms"
            name="slowThresholdMs"
            defaultValue={status?.sampling?.slowThresholdMs ?? 1000}
          />
          <Field
            label="Trace retention h"
            name="retentionTracesHours"
            defaultValue={status?.retention?.tracesHours ?? 24}
          />
          <Field
            label="Log retention h"
            name="retentionLogsHours"
            defaultValue={status?.retention?.logsHours ?? 168}
          />
          <button
            type="submit"
            className="bg-accent px-3 py-2 font-mono text-xs text-paper md:col-span-3 md:w-fit"
          >
            Save settings
          </button>
        </form>
      </section>

      <section className="border border-[var(--line)] bg-paper/70 p-5">
        <h2 className="font-display text-xl font-bold">Cardinality guardrails</h2>
        <p className="mt-1 font-mono text-xs text-ink/45">
          Checks label names against this project&apos;s allow/forbid lists — not
          live series counts in Prometheus.
        </p>
        <form onSubmit={checkCardinality} className="mt-4 flex flex-wrap gap-2">
          <input
            value={cardLabels}
            onChange={(e) => setCardLabels(e.target.value)}
            className="min-w-[280px] flex-1 border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
          />
          <button
            type="submit"
            className="border border-[var(--line)] px-3 py-2 font-mono text-xs hover:bg-mist/40"
          >
            Check labels
          </button>
        </form>
        {cardResult.length > 0 && (
          <ul className="mt-3 space-y-1 font-mono text-xs">
            {cardResult.map((r) => (
              <li key={r.label}>
                <span
                  className={
                    r.status === "forbidden"
                      ? "text-critical"
                      : r.status === "warn"
                        ? "text-degraded"
                        : "text-healthy"
                  }
                >
                  {r.status}
                </span>{" "}
                {r.label}
                {r.reason ? ` — ${r.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
        {status?.cardinality && (
          <p className="mt-3 font-mono text-xs text-ink/40">
            forbid: {status.cardinality.forbidden.join(", ")}
          </p>
        )}
      </section>

      <section className="border border-[var(--line)] bg-paper/70 p-5">
        <h2 className="font-display text-xl font-bold">Audit log</h2>
        <ul className="mt-3 space-y-2">
          {audit.length === 0 ? (
            <li className="font-mono text-sm text-ink/45">No audit events yet.</li>
          ) : (
            audit.map((e) => (
              <li key={e.id} className="font-mono text-xs">
                <span className="text-ink/40">
                  {new Date(e.createdAt).toLocaleString()}
                </span>{" "}
                <span className="text-accent">{e.action}</span> by {e.actor} ·{" "}
                {e.resourceType}
                {e.resourceId ? `:${e.resourceId.slice(0, 8)}` : ""}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: number;
}) {
  return (
    <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wider text-ink/45">
      {label}
      <input
        name={name}
        type="number"
        defaultValue={defaultValue}
        className="border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm normal-case text-ink"
      />
    </label>
  );
}
