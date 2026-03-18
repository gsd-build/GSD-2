# Build & Compilation Optimization

## Grep/Glob Patterns to Detect

### Unoptimized Build Config
```
# Webpack
mode:\s*['"]development['"]        (dev mode in production build)
devtool:\s*['"]source-map['"]      (full source maps in production)
devtool:\s*['"]eval                (eval source maps in production)
# No code splitting
splitChunks.*false                  (code splitting disabled)
# No minification
minimize:\s*false                   (minification disabled)
# Missing tree shaking
sideEffects.*true                   (prevents tree shaking)
```

### Development-Only Code in Production
```
console\.log\(                     (debug logging)
console\.debug\(                   (debug logging)
console\.trace\(                   (trace logging)
debugger;                           (debugger statement)
\.only\(                           (test.only left in)
\.skip\(                           (test.skip left in)
if\s*\(.*process\.env\.NODE_ENV.*development  (dev-only code)
__DEV__                             (React Native dev flag)
```

### Missing Optimization Flags
```
# TypeScript
"strict":\s*false                  (strict mode disabled)
"skipLibCheck":\s*false            (slow lib checking)
"incremental":\s*false             (no incremental compilation)
# Python
python\s+-O                        (check if optimized flag used)
__debug__                           (debug-only code)
# Docker
FROM.*:latest                      (unpinned base image)
RUN.*pip install(?!.*--no-cache)   (pip without --no-cache-dir)
RUN.*npm install(?!.*--production) (npm install without --production)
COPY\s+\.\s+\.                     (copying entire context)
```

### Large/Slow Imports at Startup
```
# Top-level heavy imports that could be lazy
import.*tensorflow                  (heavy ML library at top)
import.*pandas                      (heavy data library at top)
import.*matplotlib                  (heavy viz library at top)
import.*scipy                       (heavy math library at top)
from.*import\s+\*                   (wildcard imports slow startup)
# Circular imports
ImportError.*circular               (circular import errors)
```

### Missing Caching in CI/CD
```
# No caching steps
npm install(?!.*cache)              (npm install without cache)
pip install(?!.*cache)              (pip install without cache)
go build(?!.*cache)                 (go build without cache)
docker build(?!.*cache)             (docker build without layer cache)
```

### Slow Test Suite
```
# Real I/O in tests
fetch\(.*test                       (real network calls in tests)
requests\.\w+\(.*test              (real HTTP in Python tests)
open\(.*test                        (real file I/O in tests)
# No test parallelization
--runInBand                         (Jest sequential mode)
-p no:xdist                         (pytest parallelization disabled)
# Heavy setup/teardown
beforeAll.*database                 (real DB setup in tests)
setUp.*database                     (real DB in Python tests)
```

## Improvement Strategies

1. **Build config**: Ensure production mode, minification, tree shaking, code splitting
2. **Dev code**: Strip console.log/debugger via build plugin (e.g., babel-plugin-transform-remove-console)
3. **TypeScript**: Enable strict, incremental, skipLibCheck for faster builds
4. **Docker**: Multi-stage builds, .dockerignore, layer caching, pinned versions
5. **Lazy imports**: Move heavy imports to function scope where they're needed
6. **CI caching**: Cache node_modules, pip cache, go build cache, Docker layers
7. **Test speed**: Mock I/O, run tests in parallel, use in-memory DBs for integration tests
