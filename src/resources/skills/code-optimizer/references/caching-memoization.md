# Caching & Memoization

## Grep/Glob Patterns to Detect

### Missing Memoization
```
# Expensive computations without caching
def\s+\w+\(.*\).*:\s*\n.*for.*for      (Python: expensive function without @lru_cache)
function\s+\w+\(.*\).*\{.*for.*for     (JS: expensive function without memoization)
# React missing useMemo/useCallback
const\s+\w+\s*=\s*\w+\.filter\(        (derived data on every render)
const\s+\w+\s*=\s*\w+\.map\(           (derived data on every render)
const\s+\w+\s*=\s*\w+\.reduce\(        (derived data on every render)
const\s+\w+\s*=\s*\w+\.sort\(          (sorting on every render)
# Same computation called multiple times
(\w+)\(same_args\).*\1\(same_args\)    (same function, same args, called twice)
```

### Cache Without Invalidation
```
cache\s*=\s*\{\}                        (cache without TTL or max size)
_cache\s*=\s*\{\}                       (module cache without eviction)
memo\s*=\s*\{\}                         (memo without invalidation)
\.cache\s*=\s*\{\}                      (instance cache without cleanup)
CACHE_TTL.*=.*(?:86400|3600.*24)       (very long TTL - stale data risk)
```

### Redundant API/DB Calls
```
# Same query executed multiple times
\.query\(.*same.*\.query\(             (duplicate queries)
fetch\(['"]same_url['"]\).*fetch\(     (duplicate fetches)
# No SWR/stale-while-revalidate
useEffect\(.*fetch\(.*\[\]            (fetch on every mount without caching)
useEffect\(.*axios\.\w+\(.*\[\]       (API call on every mount)
componentDidMount.*fetch               (fetch without caching layer)
```

### Over-Caching
```
# Caching things that change frequently
cache.*user.*session                   (caching session-specific data)
cache.*real.?time                      (caching real-time data)
cache.*current.*time                   (caching time-dependent data)
# Caching large objects
cache\[.*\]\s*=\s*.*large             (large objects in cache)
```

### Missing HTTP Caching
```
# API responses without cache headers
res\.json\(                            (check if Cache-Control is set)
return\s+Response\(                    (check if cache headers are set)
return\s+JsonResponse\(               (Django: check cache headers)
# Static assets without long cache
express\.static\(                      (check maxAge setting)
nginx.*location.*static               (check expires/cache-control)
```

### Computed Properties Recalculated
```
# Getters that compute on every access
get\s+\w+\(\)\s*\{.*return.*\.filter   (getter computing on each access)
get\s+\w+\(\)\s*\{.*return.*\.map      (getter computing on each access)
@property\s*\n\s*def.*\n.*for          (Python property computing in loop)
```

## Improvement Strategies

1. **Memoization**: Use @lru_cache (Python), useMemo/useCallback (React), _.memoize (JS)
2. **Cache invalidation**: Always set TTL and max size; prefer LRU eviction
3. **API caching**: Use SWR/React Query for client, Redis/Memcached for server
4. **HTTP caching**: Set Cache-Control headers, use ETags, stale-while-revalidate
5. **Computed properties**: Cache results with dirty flag or use memoized selectors (reselect)
6. **Request deduplication**: Deduplicate identical in-flight requests
7. **Multi-level cache**: L1 (in-memory) -> L2 (Redis) -> L3 (DB) for read-heavy workloads
