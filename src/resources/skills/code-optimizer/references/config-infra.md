# Configuration & Infrastructure Inefficiencies

## Grep/Glob Patterns to Detect

### Missing Connection Pooling
```
# New connection per request
create_engine\(.*(?!.*pool)        (SQLAlchemy without pool config)
new Pool\(.*(?!.*max)              (pg Pool without max connections)
mongoose\.connect\(.*(?!.*pool)    (Mongoose without pool)
DriverManager\.getConnection\(     (Java: new connection per call)
psycopg2\.connect\(.*(?!.*pool)   (psycopg2 without pool)
redis\.createClient\(.*per.*request (new Redis client per request)
```

### Missing Environment-Based Config
```
hardcoded.*url                     (hardcoded URLs)
['"]http://localhost               (hardcoded localhost URLs)
['"]127\.0\.0\.1                   (hardcoded localhost IPs)
password\s*=\s*['"]                (hardcoded passwords)
api.?key\s*=\s*['"]               (hardcoded API keys)
secret\s*=\s*['"]                  (hardcoded secrets)
port\s*=\s*\d{4}                   (hardcoded port numbers)
```

### Missing Process Management
```
# Single-threaded Node.js without clustering
app\.listen\(.*(?!.*cluster)       (Node without cluster module)
# Python without proper WSGI/ASGI workers
\.run\(.*debug=True                (Flask debug mode)
uvicorn\.run\(.*workers=1          (single worker)
gunicorn.*-w\s*1\b                 (single gunicorn worker)
```

### Docker/Container Issues
```
FROM.*:latest                      (unpinned image version)
RUN.*apt-get.*&&.*apt-get         (check if apt cache is cleaned)
COPY\s+\.\s+\.                     (copying entire context - no .dockerignore)
RUN.*npm install\b(?!.*--production) (installing devDeps in production)
RUN.*pip install\b(?!.*--no-cache) (pip without cache clearing)
# Multiple RUN commands that should be combined
RUN.*\nRUN.*\nRUN                  (multiple RUN layers)
```

### Missing Health Checks
```
# Services without health endpoints
app\.(listen|start)\(.*(?!.*health) (server without health check)
# Docker without HEALTHCHECK
Dockerfile.*(?!.*HEALTHCHECK)       (Dockerfile without health check)
```

### Inefficient Polling
```
setInterval\(.*fetch               (polling instead of WebSocket/SSE)
setInterval\(.*axios               (polling instead of push)
while.*sleep.*fetch                 (polling loop)
time\.sleep\(.*requests            (Python: polling with sleep)
```

## Improvement Strategies

1. **Connection pooling**: Configure pool_size, max_overflow, pool_recycle
2. **Environment config**: Use .env files, config libraries, never hardcode secrets
3. **Process management**: Use cluster mode (Node), multiple workers (Python ASGI/WSGI)
4. **Docker**: Multi-stage builds, .dockerignore, combine RUN layers, pin versions
5. **Health checks**: Add /health endpoint, Docker HEALTHCHECK, readiness/liveness probes
6. **Polling -> Push**: Use WebSocket, SSE, or long-polling instead of interval polling
