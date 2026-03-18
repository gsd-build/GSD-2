# Security-Related Performance Issues

## Grep/Glob Patterns to Detect

### Cryptographic Misuse
```
md5\(                              (MD5 is fast but broken - use bcrypt/argon2 for passwords)
sha1\(                             (SHA1 is weak)
\.hashSync\(.*rounds.*[1-5]\b     (bcrypt with low rounds)
DES\b                              (DES is obsolete)
Math\.random\(\).*token            (Math.random for security tokens)
Math\.random\(\).*password         (Math.random for password generation)
random\.random\(\).*secret         (Python: insecure random for secrets)
```

### Expensive Security Operations in Hot Paths
```
bcrypt.*inside.*loop               (hashing in loop - expensive by design)
jwt\.verify\(.*inside.*loop        (JWT verification in loop)
encrypt\(.*inside.*loop            (encryption in loop)
\.hash\(.*inside.*loop             (hashing in loop)
```

### Missing Rate Limiting
```
app\.(get|post|put|delete)\(       (routes without rate limiting)
@app\.route\(                      (Flask routes without rate limiting)
router\.(get|post|put|delete)\(    (Express routes without rate limiting)
```

### SQL Injection Vectors (Also Performance)
```
f"SELECT.*\{                       (Python f-string SQL)
f"INSERT.*\{                       (Python f-string SQL)
`SELECT.*\$\{                      (JS template literal SQL)
"SELECT.*" \+ \w+                  (string concat SQL)
'SELECT.*' \+ \w+                  (string concat SQL)
\.raw\(.*\+                        (raw query with concatenation)
\.execute\(.*%.*%                  (Python format string SQL)
```

### ReDoS Vulnerable Patterns
```
\(\.\*\)\+                         (catastrophic backtracking)
\(\.\+\)\+                         (catastrophic backtracking)
\([^)]*\|[^)]*\)\+                (alternation with repetition)
\(\[.*\]\+\)\+                    (nested quantifiers)
new RegExp\(.*user                 (user input in regex)
re\.compile\(.*user                (Python: user input in regex)
```

### N+1 Auth Checks
```
# Checking permissions inside loops
\.can\(.*inside.*loop             (permission check in loop)
\.authorize\(.*inside.*loop       (authorization in loop)
isAllowed\(.*inside.*loop         (permission check in loop)
hasPermission\(.*inside.*loop     (permission check in loop)
```

## Improvement Strategies

1. **Crypto**: Use bcrypt/argon2 for passwords, SHA-256+ for hashing, crypto.randomBytes for tokens
2. **Hot path crypto**: Cache JWT verification results, batch encrypt/decrypt
3. **Rate limiting**: Add rate limiters (express-rate-limit, django-ratelimit, etc.)
4. **SQL injection**: Use parameterized queries/prepared statements (also faster due to query plan caching)
5. **ReDoS**: Audit regex patterns, use RE2 engine, set regex timeouts
6. **Auth batching**: Batch permission checks, pre-load permissions per request
