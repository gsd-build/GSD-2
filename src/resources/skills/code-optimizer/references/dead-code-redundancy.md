# Dead Code & Redundancy

## Grep/Glob Patterns to Detect

### Unused Exports/Functions
```
export\s+(function|const|class)\s+\w+    (cross-reference: is it imported anywhere?)
def\s+\w+\(                              (cross-reference: is it called anywhere?)
public\s+(static\s+)?\w+\s+\w+\(        (Java/C# methods - are they called?)
func\s+\w+\(                             (Go functions - are they called?)
```

### Unused Imports
```
import.*from.*['"].*['"]    (cross-reference with usage in file)
from\s+\w+\s+import\s+\w+  (Python: check if imported name is used)
require\(['"].*['"]\)       (CJS: check if result is used)
use\s+\w+;                  (Rust: check if used)
```

### Commented-Out Code
```
//\s*(function|const|let|var|class|import|return|if|for|while)
#\s*(def|class|import|return|if|for|while)
/\*[\s\S]*?(function|class|import)[\s\S]*?\*/
```

### Dead Branches
```
if\s*\(\s*false\s*\)        (always-false condition)
if\s*\(\s*true\s*\)         (always-true condition - dead else)
if\s*\(\s*0\s*\)            (falsy constant)
if\s*\(\s*['"]['"]          (empty string - always falsy)
TODO.*remove                 (TODOs indicating dead code)
FIXME.*remove
HACK.*temporary
# Feature flags stuck off
FEATURE_.*=\s*false
ENABLE_.*=\s*false
```

### Duplicate Logic
```
# Similar function signatures in same file or nearby files
function\s+\w*(get|fetch|load|process|handle)\w*\(   (many similar handlers)
def\s+\w*(get|fetch|load|process|handle)\w*\(        (Python: similar functions)
# Copy-paste indicators
# Same code block appearing multiple times (use Grep to find identical blocks)
```

### Deprecated/Legacy Code
```
@deprecated
@Deprecated
# deprecated
\.deprecated
DEPRECATED
legacy
Legacy
LEGACY
__legacy__
_old\b
_backup\b
_v[0-9]\b       (versioned functions like process_v1)
```

### Unreachable Code
```
return.*\n\s*(var|let|const|function)   (code after return)
throw.*\n\s*(var|let|const|function)    (code after throw)
exit\(\).*\n                            (code after exit)
sys\.exit\(.*\n                         (Python: code after sys.exit)
break\s*;\s*\n\s*\w                     (code after break)
```

## Improvement Strategies

1. **Unused exports**: Remove and verify no external consumers (check all import statements)
2. **Unused imports**: Remove with IDE or linting tooling
3. **Commented code**: Delete it - version control preserves history
4. **Dead branches**: Remove unreachable code, clean up feature flags
5. **Duplicate logic**: Extract shared function, use strategy pattern if variants differ slightly
6. **Deprecated code**: Plan migration, remove after all callers are updated
7. **Unreachable code**: Remove statements after return/throw/exit
