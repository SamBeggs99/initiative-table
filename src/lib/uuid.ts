/** UUID helper that works on http:// as well as https://. */

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** `crypto.randomUUID` is missing in non-secure contexts (plain http). */
export function installUuidPolyfill(): void {
  const c = globalThis.crypto as Crypto | undefined;
  if (!c || typeof c.randomUUID === 'function') return;
  try {
    Object.defineProperty(c, 'randomUUID', {
      value: newId as Crypto['randomUUID'],
      configurable: true,
    });
  } catch {
    (c as Crypto).randomUUID = newId as Crypto['randomUUID'];
  }
}

export function redirectInsecureToHttps(): void {
  if (typeof window === 'undefined' || typeof location === 'undefined') return;
  if (location.protocol !== 'http:') return;
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    return;
  }
  location.replace(
    `https://${location.host}${location.pathname}${location.search}${location.hash}`,
  );
}
