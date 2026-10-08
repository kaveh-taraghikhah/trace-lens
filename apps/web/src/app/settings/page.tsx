import { AppHeader } from "@/components/AppHeader";
import { SettingsClient } from "@/components/SettingsClient";

export const dynamic = "force-dynamic";

const API_URL = process.env.TRACELENS_API_URL ?? "http://localhost:4000";

async function loadStatus() {
  try {
    const headers: HeadersInit = {};
    if (process.env.TRACELENS_API_KEY) {
      headers["x-api-key"] = process.env.TRACELENS_API_KEY;
    }
    const res = await fetch(`${API_URL}/api/platform/status`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function SettingsPage() {
  const status = await loadStatus();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <AppHeader
        active="settings"
        subtitle="API keys and project settings for this demo org."
      />
      <h1 className="mb-6 font-display text-2xl font-bold">Platform settings</h1>
      <SettingsClient initialStatus={status} />
    </main>
  );
}
