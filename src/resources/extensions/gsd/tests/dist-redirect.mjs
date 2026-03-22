import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const ROOT = new URL("../../../../../", import.meta.url);

export function resolve(specifier, context, nextResolve) {
  // 1. Direct redirects to dist/ for specific packages
  if (specifier === "../../packages/pi-coding-agent/src/index.js") {
    specifier = new URL("packages/pi-coding-agent/dist/index.js", ROOT).href;
  } else if (specifier === "@gsd/pi-ai/oauth") {
    specifier = new URL("packages/pi-ai/dist/utils/oauth/index.js", ROOT).href;
  } else if (specifier === "@gsd/pi-ai") {
    specifier = new URL("packages/pi-ai/dist/index.js", ROOT).href;
  } else if (specifier === "@gsd/pi-agent-core") {
    specifier = new URL("packages/pi-agent-core/dist/index.js", ROOT).href;
  } else if (specifier === "@gsd/pi-tui") {
    specifier = new URL("packages/pi-tui/dist/index.js", ROOT).href;
  }
  // 2. Redirect packages/*/dist/ → packages/*/src/ with .js→.ts for strip-types
  //    Also handles local imports — skip rewrite for dist/ paths that are real compiled artifacts.

  else if (specifier.endsWith('.js') && (specifier.startsWith('./') || specifier.startsWith('../'))) {
    if (context.parentURL && context.parentURL.includes('/src/')) {
      if (specifier.includes('/dist/')) {
        specifier = specifier.replace('/dist/', '/src/').replace(/\.js$/, '.ts');
      } else {
        specifier = specifier.replace(/\.js$/, '.ts');
      }
    }
  }
  // 3. Extensionless relative imports from web/ (Next.js convention).
  //    Transpiled .tsx files emit extensionless imports — try .ts then .tsx.
  else if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !specifier.match(/\.\w+$/) &&
    context.parentURL &&
    context.parentURL.includes('/web/')
  ) {
    const baseUrl = new URL(specifier, context.parentURL);
    for (const ext of ['.ts', '.tsx']) {
      const candidate = fileURLToPath(baseUrl) + ext;
      if (existsSync(candidate)) {
        specifier = baseUrl.href + ext;
        break;
      }

    }
  }

  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  // Node's --experimental-strip-types handles .ts but not .tsx (which may contain JSX).
  // Use TypeScript to transpile .tsx → JS with react-jsx transform, then serve as module.
  if (url.endsWith('.tsx')) {
    const ts = require('typescript');
    const source = readFileSync(fileURLToPath(url), 'utf-8');
    const { outputText } = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
        esModuleInterop: true,
      },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
