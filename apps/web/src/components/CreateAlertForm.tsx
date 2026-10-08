"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { DEMO_SERVICES } from "@tracelens/types";
import { apiHeaders, getBrowserApiBase } from "@/lib/client-api";

export function CreateAlertForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const API_URL = getBrowserApiBase();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const serviceRaw = String(fd.get("service") ?? "");
    const body = {
      name: String(fd.get("name") ?? ""),
      description: String(fd.get("description") ?? ""),
      metricType: String(fd.get("metricType") ?? "error_rate"),
      service: serviceRaw === "" ? null : serviceRaw,
      comparator: String(fd.get("comparator") ?? "gt"),
      threshold: Number(fd.get("threshold")),
      windowSeconds: Number(fd.get("windowSeconds") ?? 300),
      forSeconds: Number(fd.get("forSeconds") ?? 60),
      severity: String(fd.get("severity") ?? "warning"),
      enabled: fd.get("enabled") === "on",
    };

    try {
      const res = await fetch(`${API_URL}/api/alerts/rules`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error ?? `Create failed (${res.status})`);
      }
      router.push(`/alerts/${payload.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 border border-[var(--line)] bg-paper/70 p-5"
    >
      <Field label="Name">
        <input
          name="name"
          required
          className="w-full border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
          placeholder="Payment API Error Rate High"
        />
      </Field>
      <Field label="Description">
        <textarea
          name="description"
          rows={3}
          className="w-full border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Metric">
          <select
            name="metricType"
            className="w-full border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
            defaultValue="error_rate"
          >
            <option value="error_rate">Error rate</option>
            <option value="p95_latency">p95 latency (ms)</option>
            <option value="request_rate">Request rate</option>
            <option value="request_rate_drop">Request rate drop (ratio)</option>
          </select>
        </Field>
        <Field label="Service (optional)">
          <select
            name="service"
            className="w-full border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
            defaultValue=""
          >
            <option value="">All services</option>
            {DEMO_SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Comparator">
          <select
            name="comparator"
            className="w-full border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
            defaultValue="gt"
          >
            <option value="gt">greater than</option>
            <option value="lt">less than</option>
          </select>
        </Field>
        <Field label="Threshold">
          <input
            name="threshold"
            type="number"
            step="any"
            required
            defaultValue={0.05}
            className="w-full border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
          />
        </Field>
        <Field label="Window (seconds)">
          <input
            name="windowSeconds"
            type="number"
            min={60}
            max={3600}
            defaultValue={300}
            className="w-full border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
          />
        </Field>
        <Field label="For (seconds)">
          <input
            name="forSeconds"
            type="number"
            min={0}
            max={3600}
            defaultValue={60}
            className="w-full border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
          />
        </Field>
        <Field label="Severity">
          <select
            name="severity"
            className="w-full border border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm"
            defaultValue="warning"
          >
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 pt-6 font-mono text-sm">
          <input name="enabled" type="checkbox" defaultChecked />
          Enabled
        </label>
      </div>

      {error && (
        <p className="font-mono text-sm text-critical" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="bg-accent px-4 py-2 font-mono text-sm text-paper hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create alert rule"}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wider text-ink/45">
      {label}
      <span className="normal-case">{children}</span>
    </label>
  );
}
