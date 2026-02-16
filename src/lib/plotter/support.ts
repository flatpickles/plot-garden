export function supportsWebSerial(): boolean {
  if (typeof navigator === "undefined") return false;
  return "serial" in navigator;
}

export function isChromiumBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const chromium = /Chrome|Chromium|Edg\//.test(ua);
  const firefox = /Firefox\//.test(ua);
  return chromium && !firefox;
}

export function supportsDirectPlotting(): boolean {
  return supportsWebSerial() && isChromiumBrowser();
}
