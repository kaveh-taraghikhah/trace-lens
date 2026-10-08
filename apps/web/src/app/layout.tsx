import type { Metadata } from "next";
import { DevModeBanner } from "@/components/DevModeBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "TraceLens",
  description:
    "Local OpenTelemetry demo — services, traces, logs, alerts, incidents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <DevModeBanner />
        {children}
      </body>
    </html>
  );
}
