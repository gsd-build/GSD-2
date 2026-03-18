# Data Structures & Serialization

## Grep/Glob Patterns to Detect

### Wrong Data Structure for the Job
```
# Array used for frequent lookups (should be Map/Set/dict)
\.find\(.*===                  (linear search - use Map)
\.findIndex\(.*===             (linear search for index)
\.includes\(.*inside.*loop     (O(n) lookup in loop)
\.indexOf\(.*inside.*loop      (O(n) lookup in loop)
if.*in\s+\[                    (Python: list membership test)
list\.count\(                  (Python: counting in list)

# Searching sorted data linearly (should use binary search)
\.find\(.*sorted               (linear search on sorted array)
for.*sorted                    (iterating sorted data to find)

# Using objects where Map is better (non-string keys, frequent add/delete)
\w+\[\w+\.id\]\s*=             (object with dynamic keys from IDs)
delete\s+\w+\[                 (frequent deletion from object)
Object\.keys\(.*\.length       (counting object keys - Map.size is O(1))

# Using array for queue/deque operations
\.shift\(\)                    (Array.shift is O(n) - use proper queue)
\.unshift\(                    (Array.unshift is O(n))
```

### Unnecessary Deep Copies
```
JSON\.parse\(JSON\.stringify    (JSON round-trip for deep clone)
\.map\(.*\.map\(.*spread       (nested spread for deep copy)
\{\.\.\..*\{\.\.\.             (nested object spread)
structuredClone\(.*inside.*loop (deep cloning in loop)
copy\.deepcopy\(.*loop         (Python deepcopy in loop)
import\s+copy                  (check if deepcopy is overused)
```

### Inefficient Serialization
```
# JSON for internal communication (use binary formats)
JSON\.stringify.*JSON\.parse.*internal
pickle\.dump.*pickle\.load     (Python: consider msgpack for cross-language)
# Serializing more than needed
JSON\.stringify\(.*entire      (serializing entire object when subset needed)
\.toJSON\(\)                   (check what's being serialized)
# Repeated serialization
JSON\.stringify\(.*loop        (stringifying in loop)
JSON\.parse\(.*loop            (parsing in loop)
```

### Unnecessary Object Creation
```
new Date\(.*inside.*loop       (creating Date objects in loop)
new RegExp\(.*inside.*loop     (compiling regex in loop)
new URL\(.*inside.*loop        (creating URL objects in loop)
\.split\(.*\.join\(            (split then join - use replace)
\.toString\(\).*\.split\(      (unnecessary string conversion)
Array\.from\(.*Array\.from\(   (double Array.from)
```

### Immutability Overhead
```
# Excessive spread operators
\{\.\.\.state,                 (spreading large state objects)
\[\.\.\.array,                 (spreading large arrays)
\.map\(.*=>.*\{\.\.\.         (creating new objects in map with spread)
# Immer not used where it should be
produce\(                      (check if immer is used consistently)
```

## Improvement Strategies

1. **Array -> Map/Set**: Use Map for key-value lookups, Set for membership testing
2. **Array.shift/unshift**: Use a proper deque/queue implementation
3. **Deep copies**: Use structuredClone (modern), or targeted shallow copies
4. **Serialization**: Use msgpack/protobuf for internal services, only JSON for external APIs
5. **Object creation in loops**: Hoist object creation, reuse instances, use object pools
6. **Large state spreads**: Use Immer's produce(), or targeted updates
7. **Binary search**: Use on sorted data instead of linear search
