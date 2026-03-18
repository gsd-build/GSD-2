# Database & Query Optimization

## Grep/Glob Patterns to Detect

### N+1 Query Problems
```
# ORM loops - querying inside iterations
for.*in.*\.all\(\)
for.*in.*\.filter\(
for.*in.*\.objects\.
\.prefetch_related  (absence of - check if loops exist WITHOUT prefetch)
\.select_related    (absence of - check if FK access exists WITHOUT select_related)
# SQLAlchemy
session\.query.*for.*in
\.lazy\s*=\s*True
# ActiveRecord
\.each.*\.where
\.map.*\.find
# Sequelize / TypeORM
findOne.*inside.*map
findOne.*inside.*for
await.*find.*inside.*loop
```

### Unoptimized Queries
```
SELECT \*
SELECT.*FROM.*WITHOUT.*WHERE  (full table scans)
LIKE '%           (leading wildcard - can't use index)
ORDER BY.*RAND()
NOT IN.*SELECT     (subquery instead of JOIN)
DISTINCT.*SELECT \*
GROUP BY.*without.*index
\.raw\(.*SELECT    (raw queries - potential SQL injection too)
COUNT\(\*\).*WHERE  (count with filter vs indexed count)
```

### Missing Indexes (Heuristic)
```
WHERE.*=.*AND.*=    (composite queries without composite index)
ORDER BY.*multiple columns
JOIN.*ON.*without index hint
\.filter\(.*__in=   (IN queries on large sets)
```

### ORM Anti-patterns
```
\.save\(\).*inside.*loop    (batch update instead)
\.create\(\).*inside.*loop  (bulk_create instead)
\.update\(\).*for.*in       (queryset.update instead)
len\(.*\.all\(\)\)          (.count() instead)
list\(.*\.all\(\)\)         (unnecessary materialization)
if.*\.exists\(\).*\.first\(\)  (double query)
\.values\(\).*\.values\(\)     (chained values)
```

### Connection Management
```
# Missing connection pooling
create_engine\(.*pool_size  (check if pool is configured)
new Pool\(                   (check pool settings)
max_connections             (check if reasonable)
# Unclosed connections
connection\.open.*without.*close
cursor.*without.*close
```

## Improvement Strategies

1. **N+1 Queries**: Use eager loading (prefetch_related, select_related, JOIN FETCH, include/eager)
2. **SELECT ***: Select only needed columns
3. **Missing indexes**: Add indexes on frequently filtered/joined columns
4. **Loop queries**: Use bulk operations (bulk_create, bulk_update, executemany)
5. **Connection pooling**: Configure connection pools with appropriate size
6. **Query caching**: Cache frequently-read, rarely-changing data
7. **Pagination**: Never load unbounded result sets
