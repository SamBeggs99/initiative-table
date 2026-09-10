import 'fake-indexeddb/auto';

/**
 * Minimal in-memory localStorage so store-level tests can exercise the real
 * persist middleware (including the quota guard) under the `node` environment.
 * `quotaAfterBytes` lets a test wall off the store the way a real browser does.
 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  /** Throw QuotaExceededError once the payload passes this size. */
  quotaAfterBytes = Number.POSITIVE_INFINITY;

  get length(): number {
    return this.map.size;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (value.length > this.quotaAfterBytes) {
      const err = new Error('The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

export const memoryStorage = new MemoryStorage();

// Defined unconditionally: some Node builds expose a `localStorage` global that
// is not a working Storage, which is worse than none at all.
Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  configurable: true,
  writable: true,
});

/**
 * The store reaches for `window.setTimeout` (toast auto-dismiss). Tests run in
 * the `node` environment on purpose — the game logic has no business needing a
 * DOM — so point `window` at the global timers rather than pulling in jsdom.
 */
if (!('window' in globalThis)) {
  Object.defineProperty(globalThis, 'window', {
    value: globalThis,
    configurable: true,
    writable: true,
  });
}
if (!('addEventListener' in globalThis)) {
  Object.assign(globalThis, {
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}
