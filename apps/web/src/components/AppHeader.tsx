import Link from "next/link";

const links = [
  { href: "/services", label: "Services" },
  { href: "/traces", label: "Traces" },
  { href: "/logs", label: "Logs" },
  { href: "/alerts", label: "Alerts" },
  { href: "/incidents", label: "Incidents" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppHeader({
  active,
  subtitle,
}: {
  active:
    | "services"
    | "traces"
    | "logs"
    | "alerts"
    | "incidents"
    | "settings";
  subtitle: string;
}) {
  return (
    <header className="mb-10 flex flex-col gap-4 border-b border-[var(--line)] pb-8 md:flex-row md:items-end md:justify-between">
      <div>
        <Link
          href="/services"
          className="font-display text-4xl font-extrabold tracking-tight md:text-5xl"
        >
          TraceLens
        </Link>
        <p className="mt-2 max-w-xl text-base text-ink/70">{subtitle}</p>
      </div>
      <nav className="flex flex-wrap gap-4 font-mono text-sm text-ink/60">
        {links.map((link) => {
          const activeExact =
            (active === "services" && link.href === "/services") ||
            (active === "traces" && link.href === "/traces") ||
            (active === "logs" && link.href === "/logs") ||
            (active === "alerts" && link.href === "/alerts") ||
            (active === "incidents" && link.href === "/incidents") ||
            (active === "settings" && link.href === "/settings");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={activeExact ? "text-accent" : "hover:text-ink"}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
