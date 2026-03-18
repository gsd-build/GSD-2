# Concurrency & Async Patterns

## Grep/Glob Patterns to Detect

### Sequential Async (Should Be Parallel)
```
await.*\n.*await.*\n.*await    (multiple sequential awaits that could be parallel)
for.*await                      (sequential await in loop)
\.then\(.*\.then\(.*\.then\(   (promise chain that could be Promise.all)
# Python
await.*\n.*await.*\n.*await    (sequential awaits)
for.*in.*:\n.*await            (await in loop)
```

### Missing Parallelization
```
# Should use Promise.all / asyncio.gather
fetch\(.*\n.*fetch\(           (sequential fetches)
axios\.\w+\(.*\n.*axios\.     (sequential HTTP calls)
requests\.\w+\(.*\n.*requests\. (Python sequential requests)
```

### Blocking Operations in Async Context
```
# Node.js sync operations in async code
fs\.readFileSync               (blocking file read)
fs\.writeFileSync              (blocking file write)
fs\.existsSync                 (blocking existence check)
child_process\.execSync        (blocking exec)
\.readFileSync\(               (any sync file operation)
# Python blocking in async
time\.sleep\(                  (use asyncio.sleep instead)
requests\.                     (use aiohttp/httpx instead)
open\(.*\.read\(\)            (use aiofiles instead)
os\.path\.exists               (use aio equivalent)
```

### Race Conditions & Thread Safety
```
# Shared mutable state
global\s+\w+.*=               (Python global mutation)
threading\.Thread.*shared      (shared state across threads)
# Missing locks
\.append\(.*thread             (list append without lock)
\+=.*without.*lock             (increment without lock)
# JavaScript
let\s+\w+.*=.*\n.*async       (mutable let used in async)
```

### Unbounded Concurrency
```
# No concurrency limit
\.map\(.*fetch                 (unbounded parallel fetches)
\.map\(.*axios                 (unbounded parallel requests)
Promise\.all\(.*\.map\(        (all items in parallel, no limit)
asyncio\.gather\(.*for         (all coroutines at once)
# Missing backpressure
while.*true.*await             (infinite async loop without backpressure)
```

### Error Handling in Async
```
# Unhandled rejections
\.then\(.*without.*\.catch     (promise without catch)
async.*without.*try.*catch     (async without error handling)
# Swallowed errors
catch\s*\(\s*\)\s*\{          (empty catch block)
except:\s*$                    (bare except)
except\s+Exception\s*:.*pass  (catch-all with pass)
```

## Improvement Strategies

1. **Sequential awaits**: Use Promise.all/allSettled, asyncio.gather for independent operations
2. **Await in loops**: Batch with Promise.all or use p-limit for controlled concurrency
3. **Blocking in async**: Replace sync APIs with async equivalents
4. **Race conditions**: Use locks, atomic operations, or immutable patterns
5. **Unbounded concurrency**: Use semaphores, p-limit, connection pools
6. **Error handling**: Always catch async errors, use Promise.allSettled for partial failure tolerance
7. **Backpressure**: Use queues, streaming, or batching for producer-consumer patterns
