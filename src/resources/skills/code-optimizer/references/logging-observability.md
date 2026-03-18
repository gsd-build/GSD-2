# Logging & Observability Performance

## Grep/Glob Patterns to Detect

### Excessive Logging
```
console\.log\(                     (console.log in production code)
console\.debug\(                   (console.debug in production)
print\(.*debug                     (Python print debugging)
logger\.debug\(.*inside.*loop      (debug logging in hot loop)
log\.\w+\(.*inside.*for            (any logging in tight loop)
console\.log\(JSON\.stringify\(    (serializing objects just to log)
```

### Expensive String Formatting in Logs
```
# String interpolation/formatting when log level is disabled
logger\.debug\(f"                  (Python f-string even when debug disabled)
logger\.debug\(.*\.format\(        (Python .format() even when debug disabled)
logger\.debug\(`                   (JS template literal even when debug disabled)
logger\.debug\(.*\+.*\+            (string concat for debug log)
JSON\.stringify\(.*log             (JSON stringify for logging)
```

### Missing Structured Logging
```
console\.log\(["'].*:.*["']        (unstructured string logging)
print\(.*["'].*:.*["']             (unstructured print logging)
logger\.\w+\(["'].*["'] %         (format string logging vs structured)
```

### Synchronous Logging
```
fs\.writeFileSync.*log             (sync file write for logging)
fs\.appendFileSync.*log            (sync file append for logging)
open\(.*log.*\)\.write\(          (Python: sync log file write)
```

### Missing Request/Trace IDs
```
# API handlers without correlation IDs
app\.(get|post)\(.*req.*res       (check if request ID is propagated)
@app\.route\(                      (check if request ID middleware exists)
```

### Metrics Collection Overhead
```
# Metrics in hot paths
\.observe\(.*inside.*loop         (Prometheus observe in loop)
\.increment\(.*inside.*loop       (counter increment in loop)
statsd\..*inside.*loop            (StatsD in loop)
\.timing\(.*inside.*loop          (timing metric in loop)
Date\.now\(\).*Date\.now\(\)      (manual timing - use proper instrumentation)
performance\.now\(\).*performance (manual performance timing)
```

## Improvement Strategies

1. **Console.log**: Remove from production, use proper logger with levels
2. **Log formatting**: Use lazy evaluation - logger.debug("msg %s", expensive_value) vs f-strings
3. **Structured logging**: Use JSON structured logs for machine parsing
4. **Async logging**: Buffer and flush logs asynchronously, don't block request handling
5. **Request IDs**: Add correlation ID middleware, propagate through all service calls
6. **Metrics**: Pre-aggregate metrics, use histograms instead of per-request timers in hot loops
