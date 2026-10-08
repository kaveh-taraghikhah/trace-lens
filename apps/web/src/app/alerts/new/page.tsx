import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { CreateAlertForm } from "@/components/CreateAlertForm";

export default function NewAlertPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10 md:px-10">
      <AppHeader
        active="alerts"
        subtitle="New rule — metric, threshold, and hold duration."
      />
      <Link
        href="/alerts"
        className="mb-6 inline-block font-mono text-sm text-accent hover:underline"
      >
        ← Back to alerts
      </Link>
      <h1 className="mb-4 font-display text-2xl font-bold">New alert rule</h1>
      <CreateAlertForm />
    </main>
  );
}
