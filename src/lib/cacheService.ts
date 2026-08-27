// High-Efficiency Multi-Tier Cache & In-Flight Request Deduplication Layer
// Drastically eliminates redundant Firestore network reads and writes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const inFlightPromises = new Map<string, Promise<any>>();

const STORAGE_CACHE_PREFIX = 'pl_cache_';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || window.sessionStorage || null;
  } catch {
    return null;
  }
}

/**
 * Read from memory cache or persistent storage fallback
 * Default TTL: 15 minutes (900,000 ms)
 */
export function getCached<T>(key: string, ttlMs: number = 900000): T | null {
  // 1. Check in-memory Map first (ultra-fast)
  const entry = memoryCache.get(key);
  if (entry) {
    if (Date.now() - entry.timestamp <= ttlMs) {
      return entry.data as T;
    }
    memoryCache.delete(key);
  }

  // 2. Check localStorage / sessionStorage fallback if in browser
  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(STORAGE_CACHE_PREFIX + key);
      if (raw) {
        const parsed: CacheEntry<T> = JSON.parse(raw);
        if (Date.now() - parsed.timestamp <= ttlMs) {
          // Re-populate memory cache
          memoryCache.set(key, parsed);
          return parsed.data;
        } else {
          storage.removeItem(STORAGE_CACHE_PREFIX + key);
        }
      }
    } catch {
      // Ignore storage errors (e.g. quota or privacy mode)
    }
  }

  return null;
}

/**
 * Utility to deduplicate an array of items by unique id, cardCode, uid or email
 */
export function deduplicateList<T>(items: T[]): T[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!item) continue;
    const it = item as any;
    // Prefer primary document ID / cardCode first
    const key = it.id || it.cardCode || it.uid || (it.email ? `email:${it.email}` : undefined);
    if (key) {
      const lowerKey = typeof key === 'string' ? key.toLowerCase() : String(key);
      if (!seen.has(lowerKey)) {
        seen.add(lowerKey);
        result.push(item);
      }
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * Mutate a cached list in-place across memory and storage without invalidation/refetch
 */
export function updateCachedList<T>(keyOrPrefix: string, updater: (currentList: T[]) => T[]): void {
  const storage = getStorage();

  // Update in-memory cache entries matching key or prefix
  for (const [k, entry] of memoryCache.entries()) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) {
      if (Array.isArray(entry.data)) {
        entry.data = deduplicateList(updater(entry.data as T[]));
        entry.timestamp = Date.now();
        // Sync to storage
        if (storage) {
          try {
            storage.setItem(STORAGE_CACHE_PREFIX + k, JSON.stringify(entry));
          } catch {
            // Ignore
          }
        }
      }
    }
  }

  // Check and update any storage entries not in memory
  if (storage) {
    try {
      const targetPrefix = STORAGE_CACHE_PREFIX + keyOrPrefix;
      for (let i = 0; i < storage.length; i++) {
        const storageKey = storage.key(i);
        if (storageKey && (storageKey === targetPrefix || storageKey.startsWith(targetPrefix))) {
          const raw = storage.getItem(storageKey);
          if (raw) {
            const parsed: CacheEntry<T[]> = JSON.parse(raw);
            if (Array.isArray(parsed.data)) {
              parsed.data = deduplicateList(updater(parsed.data));
              parsed.timestamp = Date.now();
              storage.setItem(storageKey, JSON.stringify(parsed));
            }
          }
        }
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Store item in memory cache and persistent storage
 */
export function setCached<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now()
  };

  memoryCache.set(key, entry);

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_CACHE_PREFIX + key, JSON.stringify(entry));
    } catch {
      // Ignore storage errors
    }
  }
}

/**
 * Deduplicate concurrent asynchronous queries so only one network call runs for identical requests
 */
export async function deduplicateRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (inFlightPromises.has(key)) {
    return inFlightPromises.get(key) as Promise<T>;
  }

  const promise = (async () => {
    try {
      const result = await fetcher();
      return result;
    } finally {
      inFlightPromises.delete(key);
    }
  })();

  inFlightPromises.set(key, promise);
  return promise;
}

/**
 * Invalidate specific cache key or prefix
 */
export function invalidateCache(keyOrPrefix?: string): void {
  const storage = getStorage();

  if (!keyOrPrefix) {
    memoryCache.clear();
    if (storage) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k && k.startsWith(STORAGE_CACHE_PREFIX)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => storage.removeItem(k));
      } catch {
        // Ignore
      }
    }
    return;
  }

  // Clear memory cache keys matching prefix
  for (const k of memoryCache.keys()) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) {
      memoryCache.delete(k);
    }
  }

  // Clear storage matching prefix
  if (storage) {
    try {
      const targetPrefix = STORAGE_CACHE_PREFIX + keyOrPrefix;
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && (k === targetPrefix || k.startsWith(targetPrefix))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    } catch {
      // Ignore
    }
  }
}

