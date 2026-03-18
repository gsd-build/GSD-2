# Bundle Size & Dependencies

## Grep/Glob Patterns to Detect

### Heavy Imports
```
import\s+\w+\s+from\s+['"]lodash['"]      (full lodash import vs lodash/specific)
import\s+\w+\s+from\s+['"]moment['"]      (moment.js - use date-fns/dayjs)
import\s+\w+\s+from\s+['"]underscore['"]  (underscore - mostly native now)
import\s+\*\s+as                           (wildcard imports prevent tree-shaking)
require\(['"]lodash['"]\)                   (CJS lodash import)
from\s+pandas\s+import\s+\*                (full pandas import)
import\s+tensorflow                         (full TF import)
import\s+boto3                              (full AWS SDK)
```

### Unused Dependencies
```
# Check package.json dependencies vs actual imports
# Check requirements.txt vs actual imports
# Check go.mod vs actual imports
import.*from.*['"](\w+)['"]   (cross-reference with package.json)
```

### Duplicate Functionality
```
# Multiple date libraries
moment.*\n.*date-fns          (both moment and date-fns)
moment.*\n.*dayjs             (both moment and dayjs)
# Multiple HTTP clients
axios.*\n.*node-fetch         (both axios and fetch)
axios.*\n.*got                (both axios and got)
# Multiple utility libraries
lodash.*\n.*underscore        (both lodash and underscore)
# Multiple state managers
redux.*\n.*mobx               (both redux and mobx)
zustand.*\n.*jotai            (multiple state libs)
```

### Dev Dependencies in Production
```
# devDependencies imported in src/
import.*from.*['"](@testing|jest|mocha|chai|sinon|cypress|storybook)
# Debug/test code in production
console\.log\(
console\.debug\(
debugger;
\.only\(         (test.only left in)
```

### Dynamic Imports Missing
```
# Large components imported statically that could be lazy
import.*Modal       (modals are great candidates for lazy loading)
import.*Chart       (charts are heavy)
import.*Editor      (rich editors are heavy)
import.*PDF         (PDF libs are heavy)
import.*Map         (map components are heavy)
# Route-level components not lazy loaded
import.*Page.*from  (page components should often be lazy)
```

### Large Assets
```
# Check for unoptimized assets
\.png['"]          (check if could be webp/avif)
\.jpg['"]          (check if could be webp/avif)
\.gif['"]          (check if could be video/webp)
\.svg['"].*import  (SVGs imported as modules - check size)
base64             (inline base64 assets)
data:image         (inline images)
```

## Improvement Strategies

1. **Lodash**: Use `lodash-es/specific` or native equivalents (Array.find, Object.entries, etc.)
2. **Moment.js**: Replace with date-fns or dayjs (10x smaller)
3. **Wildcard imports**: Use named imports for tree-shaking
4. **Unused deps**: Remove from package.json/requirements.txt
5. **Dynamic imports**: Use React.lazy/import() for heavy, below-fold components
6. **Images**: Convert to WebP/AVIF, use responsive srcset, lazy load below-fold
7. **Duplicate libs**: Consolidate to one library per concern
