// Detect whether the app is running inside the Capacitor native shell.
// Admin dashboard is web-only; user dashboard is available in both.
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  if (w.Capacitor?.isNativePlatform?.()) return true;
  if (w.Capacitor?.getPlatform && w.Capacitor.getPlatform() !== "web") return true;
  return /\bMedia\/|CapacitorWebView\b/i.test(navigator.userAgent || "");
}
