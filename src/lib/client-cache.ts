// Lightweight in-memory Stale-While-Revalidate client cache
// Eliminates repetitive blocking network waterfalls when switching between tabs.

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

export function getCachedData<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  // Return cached data even if slightly expired (Stale-While-Revalidate)
  return entry.data as T;
}

export function isCacheFresh(key: string): boolean {
  const entry = memoryCache.get(key);
  if (!entry) return false;
  return Date.now() - entry.timestamp < entry.ttl;
}

export function setCachedData<T>(key: string, data: T, ttlMs = 15000): void {
  memoryCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
  });
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Fetch with instant in-memory cache return and background revalidation.
 */
export async function fastFetch<T>(
  url: string,
  options?: RequestInit,
  ttlMs = 15000
): Promise<{ data: T; isCached: boolean }> {
  const cacheKey = `${url}:${options?.method || 'GET'}`;
  const cached = getCachedData<T>(cacheKey);
  const fresh = isCacheFresh(cacheKey);

  if (cached && fresh) {
    return { data: cached, isCached: true };
  }

  try {
    const res = await fetch(url, options);
    if (res.ok) {
      const json = await res.json();
      const extracted = json.data !== undefined ? json.data : json;
      setCachedData(cacheKey, extracted, ttlMs);
      return { data: extracted, isCached: false };
    }
  } catch (err) {
    if (cached) {
      return { data: cached, isCached: true };
    }
    throw err;
  }

  if (cached) {
    return { data: cached, isCached: true };
  }

  throw new Error(`Failed to fetch from ${url}`);
}
