# I/O & Network Optimization

## Grep/Glob Patterns to Detect

### Sequential Requests (Should Be Batched/Parallel)
```
fetch\(.*\n.*fetch\(           (sequential fetch calls)
axios\.\w+\(.*\n.*axios\.     (sequential axios calls)
requests\.\w+\(.*\n.*requests (sequential Python requests)
http\.\w+\(.*\n.*http\.       (sequential Node http calls)
\.get\(.*\n.*\.get\(           (sequential GET requests)
\.post\(.*\n.*\.post\(         (sequential POST requests)
```

### Missing Batching
```
# Individual API calls in loops
for.*\n.*fetch\(               (fetch in loop)
for.*\n.*axios\.               (axios in loop)
for.*\n.*requests\.            (requests in loop)
\.map\(.*fetch                 (map with individual fetches)
\.forEach\(.*fetch             (forEach with individual fetches)
# Individual DB writes in loops
\.save\(\).*for                (save in loop - should batch)
\.insert\(.*for                (insert in loop - should bulk insert)
```

### No Request Deduplication
```
# Same endpoint called multiple times
fetch\(['"]([^'"]+)['"]\)      (check for duplicate URLs)
axios\.\w+\(['"]([^'"]+)['"]  (check for duplicate URLs)
useQuery\(.*['"]([^'"]+)['"]  (check for duplicate query keys)
```

### Missing Compression
```
# Large payload without compression
Content-Type.*application/json  (check if gzip/br enabled)
res\.json\(                     (response without compression middleware)
# No compression middleware
express\(\).*without.*compression
```

### Inefficient Serialization
```
JSON\.stringify\(.*large        (stringifying large objects)
JSON\.parse\(.*JSON\.stringify  (deep clone via JSON - use structuredClone)
pickle\.dumps\(                 (Python: consider msgpack/protobuf for performance)
yaml\.dump\(.*yaml\.load\(     (YAML round-trip - slow for data exchange)
```

### Missing Streaming
```
\.readFile\(                   (read entire file vs createReadStream)
\.readFileSync\(               (sync + entire file)
body\.json\(\)                 (parse entire body vs streaming parser)
\.text\(\)                     (entire response as text)
\.json\(\).*large              (entire JSON response in memory)
response\.data                 (entire response buffered)
```

### Missing Caching Headers
```
# API responses without caching
res\.json\(.*without.*cache-control
res\.send\(.*without.*etag
# Static assets without cache headers
express\.static\(.*without.*maxAge
```

### Retry Without Backoff
```
retry.*count                   (check if exponential backoff exists)
while.*retry                   (retry loop without delay increase)
catch.*retry                   (catch-retry without backoff)
MAX_RETRIES                    (check backoff strategy)
```

## Improvement Strategies

1. **Sequential requests**: Use Promise.all, asyncio.gather, or batch APIs
2. **Loop requests**: Batch into single API call or use DataLoader pattern
3. **Deduplication**: Use request deduplication (SWR, React Query, custom cache)
4. **Compression**: Enable gzip/brotli at server and CDN level
5. **Serialization**: Use efficient formats (protobuf, msgpack) for internal services
6. **Streaming**: Use streams for large files/responses, NDJSON for large JSON
7. **Caching**: Set appropriate Cache-Control, ETag, use stale-while-revalidate
8. **Retries**: Implement exponential backoff with jitter
