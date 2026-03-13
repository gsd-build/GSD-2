// ESM resolve hook: .js → .ts rewriting for test environments.
// Rewrites imports from our source trees, but not from node_modules or built dist output.
//
// Handles two patterns:
// 1. .js → .ts  (pi bundler convention: source files use .js specifiers)
// 2. extensionless → .ts  (some source files omit extensions in relative imports)

export function resolve(specifier, context, nextResolve) {
  const parentURL = context.parentURL || '';
  const isFromNodeModules = parentURL.includes('/node_modules/');
  const isFromBuiltDist = parentURL.includes('/dist/');

  if (!isFromNodeModules && !isFromBuiltDist && !specifier.startsWith('node:')) {
    // Rewrite .js → .ts
    if (specifier.endsWith('.js')) {
      if (specifier.includes('/dist/')) {
        return nextResolve(specifier, context);
      }
      const tsSpecifier = specifier.replace(/\.js$/, '.ts');
      try {
        return nextResolve(tsSpecifier, context);
      } catch {
        // fall through to default resolution
      }
    }

    // Try adding .ts to extensionless relative imports
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      try {
        return nextResolve(specifier + '.ts', context);
      } catch {
        // fall through to default resolution
      }
    }
  }

  return nextResolve(specifier, context);
}
