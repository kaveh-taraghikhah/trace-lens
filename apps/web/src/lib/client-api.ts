"use client";

const STORAGE_KEY = "tracelens_api_key";

export function getStoredApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setStoredApiKey(key: string | null): void {
  if (typeof window === "undefined") return;
  if (!key) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, key);
}

export function apiHeaders(extra?: HeadersInit): HeadersInit {
  const key = getStoredApiKey();
  const base: Record<string, string> = {
    "content-type": "application/json",
  };
  if (key) base["x-api-key"] = key;
  return { ...base, ...(extra as Record<string, string> | undefined) };
}

export function getBrowserApiBase(): string {
  return process.env.NEXT_PUBLIC_TRACELENS_API_URL ?? "http://localhost:4000";
}
