# Memory & Resource Management

## Grep/Glob Patterns to Detect

### Memory Leaks
```
# Event listeners never removed
addEventListener.*without.*removeEventListener
\.on\(.*without.*\.off\(
\.subscribe\(.*without.*unsubscribe
# Timers never cleared
setInterval\(.*without.*clearInterval
setTimeout\(.*without.*clearTimeout
# Global/module-level caches without eviction
global.*\[\]        (unbounded global arrays)
global.*\{\}        (unbounded global dicts/objects)
module\.exports.*cache.*=.*\{\}
_cache\s*=\s*\{\}   (module-level cache without LRU/TTL)
# Closures retaining references
closure.*large.*object
# React-specific
useEffect.*without.*cleanup
useRef.*large.*object
```

### Unclosed Resources
```
open\(.*without.*close
open\(.*without.*with\s   (Python: not using context manager)
new FileReader\(.*without.*close
createReadStream\(.*without.*destroy
createWriteStream\(.*without.*end
fs\.open\(.*without.*fs\.close
new Socket\(.*without.*\.close
new WebSocket\(.*without.*\.close
acquire\(.*without.*release
```

### Large Allocations
```
new Array\(\d{5,}       (arrays > 10k elements)
Buffer\.alloc\(\d{6,}   (buffers > 1MB)
\.fill\(.*\d{6,}        (filling large arrays)
\.repeat\(\d{4,}         (string repeat large count)
JSON\.parse\(.*large     (parsing large JSON in memory)
\.readFileSync\(          (synchronous large file reads)
\.readFile\(.*without.*stream  (reading whole file vs streaming)
```

### String Concatenation in Loops
```
\+=.*string.*for
\+=.*\".*loop
str\s*\+=              (Python string concat in loop)
\.join\(\[              (check if used correctly)
```

## Improvement Strategies

1. **Event listeners**: Always pair add/remove, use AbortController for bulk cleanup
2. **Timers**: Clear intervals in cleanup/unmount, use refs for timer IDs
3. **Caches**: Use LRU cache with max size, add TTL, use WeakMap/WeakRef where possible
4. **File handling**: Use context managers (Python with), try-finally, or using statements
5. **Streams**: Use streaming for large data instead of loading everything in memory
6. **String building**: Use StringBuilder/list join pattern instead of concatenation in loops
7. **Buffers**: Pool and reuse buffers, use streaming transforms
