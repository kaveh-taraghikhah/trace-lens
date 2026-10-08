"use client";

import { useEffect, useState } from "react";
import { apiHeaders, getBrowserApiBase } from "@/lib/client-api";

export function DevModeBanner() {
  const [authMode, setAuthMode] = useState<string | null>(null);

  useEffect(() => {
    const api = getBrowserApiBase();
    fetch(`${api}/api/platform/status`, { headers: apiHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.authMode === "dev") setAuthMode("dev");
      })
      .catch(() => {
        /* API down — no banner */
      });
  }, []);

  if (authMode !== "dev") return null;

  return (
    <div
      role="status"
      className="border-b border-degraded/30 bg-degraded/10 px-4 py-2 text-center font-mono text-xs text-ink/70"
    >
      Dev auth — anonymous admin on the demo project. Use{" "}
      <code className="text-ink">TRACELENS_AUTH_MODE=api_key</code> and an API
      key from Settings for stricter access.
    </div>
  );
}
