# Algorithmic Complexity

## Grep/Glob Patterns to Detect

### O(n^2) and Worse Patterns
```
# Nested loops over same/related collections
for.*in.*\n.*for.*in         (nested for loops)
\.forEach\(.*\.forEach\(      (nested forEach)
\.map\(.*\.map\(              (nested map)
\.filter\(.*\.includes\(      (filter+includes = O(n*m))
\.find\(.*inside.*\.map\(     (find inside map)
\.indexOf\(.*inside.*for      (indexOf in loop)
\.includes\(.*inside.*for     (includes in loop)
# Array as lookup table
array\.find\(.*===            (use Map/Set instead)
array\.some\(.*===            (use Set.has instead)
list\.index\(                 (Python: use dict instead)
if.*in\s+list                 (Python: O(n) lookup in list)
```

### Unnecessary Iterations
```
\.filter\(.*\.length          (filter just to count)
\.filter\(.*\[0\]             (filter just to get first - use find)
\.map\(.*\.filter\(           (map then filter - combine or reverse order)
\.filter\(.*\.map\(.*\.filter (multiple passes when one suffices)
\.sort\(\).*\[0\]             (sort to get min/max - use Math.min/max or reduce)
\.sort\(\).*\.slice\(0        (sort to get top-k - use partial sort/heap)
sorted\(.*\)\[0\]             (Python: use min() instead)
sorted\(.*\)\[-1\]            (Python: use max() instead)
\.reverse\(\).*\.forEach      (reverse just to iterate backwards)
Object\.keys\(.*\.map\(.*Object\.values  (iterating keys then accessing values)
```

### Redundant Computation
```
# Same computation in loop
for.*\n.*Math\.              (math operations that could be hoisted)
for.*\n.*\.length            (accessing .length repeatedly - may be fine, check)
for.*\n.*document\.querySelector  (DOM queries in loops)
for.*\n.*JSON\.parse         (parsing same JSON repeatedly)
for.*\n.*new RegExp\(        (creating regex in loop)
for.*\n.*new Date\(          (creating Date objects in loop for same date)
```

### Inefficient Data Structure Choice
```
# Using arrays where Set/Map would be better
\.push\(.*\.includes\(       (array as unique set)
\.filter\(.*\.indexOf\(       (dedup with filter+indexOf)
\[\].*\.find\(               (array for lookups)
# Using objects where Map would be better
\{\}.*\[.*\]\s*=             (frequent dynamic key insertion)
delete.*\[                   (frequent key deletion from object)
```

## Improvement Strategies

1. **Nested loops**: Pre-build lookup Map/Set, use hash-based approaches
2. **Filter+includes**: Convert one collection to Set for O(1) lookups
3. **Sort for min/max**: Use Math.min/max, reduce, or heap for top-k
4. **Multiple passes**: Combine into single reduce/loop
5. **Redundant computation**: Hoist invariants out of loops, memoize
6. **Array as lookup**: Use Map for key-value, Set for existence checks
7. **String matching in loops**: Pre-compile regex, use Map for exact matches
