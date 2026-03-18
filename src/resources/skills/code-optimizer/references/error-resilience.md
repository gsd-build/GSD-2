# Error Handling & Resilience

## Grep/Glob Patterns to Detect

### Missing Timeouts
```
fetch\(.*(?!.*timeout)         (fetch without timeout)
axios\.\w+\(.*(?!.*timeout)   (axios without timeout)
requests\.\w+\(.*(?!.*timeout) (Python requests without timeout)
http\.\w+\(.*(?!.*timeout)    (http call without timeout)
new Promise\(.*(?!.*setTimeout) (promise without timeout)
\.connect\(.*(?!.*timeout)     (DB/socket connect without timeout)
```

### Swallowed Errors
```
catch\s*\(\s*\w*\s*\)\s*\{\s*\}  (empty catch block)
catch\s*\(\s*\)\s*\{\s*\}        (empty catch, no error param)
except:\s*$                        (bare except)
except\s+Exception.*pass          (catch-all with pass)
except\s+Exception.*continue      (catch-all with continue)
\.catch\(\s*\(\)\s*=>\s*\{\s*\}\) (empty .catch handler)
\.catch\(\s*\(\)\s*=>\s*null\)    (swallowing with null)
on_error.*pass                     (error handler that does nothing)
```

### Missing Retries for Transient Failures
```
# Network calls without retry logic
fetch\(.*(?!.*retry)           (fetch without retry)
axios\.\w+\(.*(?!.*retry)     (API call without retry)
requests\.\w+\(.*(?!.*retry)  (Python request without retry)
# Database operations without retry
\.query\(.*(?!.*retry)         (DB query without retry)
\.execute\(.*(?!.*retry)       (DB execute without retry)
```

### No Circuit Breaker
```
# Repeated calls to potentially failing services without circuit breaking
while.*retry.*fetch            (retry loop without circuit break)
MAX_RETRIES.*=.*[5-9]|[1-9]\d+ (high retry count without circuit breaker)
```

### Resource Cleanup on Error
```
# try without finally for resource cleanup
try\s*\{.*open.*(?!.*finally)   (open resource without finally)
try:.*open\(.*(?!.*finally)     (Python: open without finally or context manager)
# Async cleanup missing
async.*try.*(?!.*finally)       (async operation without cleanup)
```

### Cascading Failures
```
# No fallback/default values
\?\?.*undefined                 (check fallback quality)
\|\|.*null                      (check fallback quality)
\.get\(.*,\s*None\)            (Python: check if None is appropriate default)
# No graceful degradation
catch.*throw                    (catching just to re-throw - no degradation)
catch.*return\s+null            (returning null on error - caller may not handle)
```

### Logging Without Action
```
console\.error\(.*(?!.*throw|return|retry)  (logging error but not handling it)
logger\.error\(.*(?!.*raise|return|retry)   (Python: logging without action)
print\(.*error.*(?!.*raise|return)          (print error without handling)
```

## Improvement Strategies

1. **Timeouts**: Add timeouts to ALL external calls (network, DB, file I/O). Use AbortController for fetch
2. **Swallowed errors**: At minimum log errors, prefer explicit handling or re-throwing
3. **Retries**: Implement exponential backoff with jitter for transient failures
4. **Circuit breakers**: Use circuit breaker pattern for external service calls
5. **Resource cleanup**: Use try-finally, context managers, or using statements
6. **Graceful degradation**: Return cached/default data instead of failing completely
7. **Error propagation**: Don't catch errors you can't handle - let them bubble up
