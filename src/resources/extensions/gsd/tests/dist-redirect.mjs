const ROOT = new URL("../../../../../", import.meta.url);
const MAIN_REPO = process.env.GSD_MAIN_REPO
  ? new URL(`file://${process.env.GSD_MAIN_REPO}/`)
  : ROOT;

export function resolve(specifier, context, nextResolve) {
  // 1. Direct redirects to dist/ for specific packages
  // Use main repo's built packages since worktrees don't have separate builds
  if (specifier === "../../packages/pi-coding-agent/src/index.js") {
    specifier = new URL("packages/pi-coding-agent/dist/index.js", MAIN_REPO).href;
  } else if (specifier === "@gsd/pi-ai/oauth") {
    specifier = new URL("packages/pi-ai/dist/utils/oauth/index.js", MAIN_REPO).href;
  } else if (specifier === "@gsd/pi-ai") {
    specifier = new URL("packages/pi-ai/dist/index.js", MAIN_REPO).href;
  } else if (specifier === "@gsd/pi-agent-core") {
    specifier = new URL("packages/pi-agent-core/dist/index.js", MAIN_REPO).href;
  }
  // 1b. MCP SDK aliases used by pi-coding-agent extension loader.
  // Tests don't need the loader implementation itself, but dist imports must resolve.
  else if (specifier === "@modelcontextprotocol/sdk/client") {
    specifier = new URL("node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js", MAIN_REPO).href;
  } else if (specifier === "@modelcontextprotocol/sdk/client/stdio") {
    specifier = new URL("node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js", MAIN_REPO).href;
  } else if (specifier === "@modelcontextprotocol/sdk/client/stdio.js") {
    specifier = new URL("node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js", MAIN_REPO).href;
  } else if (specifier === "@modelcontextprotocol/sdk/client/streamableHttp") {
    specifier = new URL("node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js", MAIN_REPO).href;
  } else if (specifier === "@modelcontextprotocol/sdk/client/streamableHttp.js") {
    specifier = new URL("node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js", MAIN_REPO).href;
  }
  // 2. Mapping .js to .ts for local imports when running tests from src/
  else if (specifier.endsWith('.js') && (specifier.startsWith('./') || specifier.startsWith('../'))) {
    if (context.parentURL && context.parentURL.includes('/src/')) {
      if (specifier.includes('/dist/')) {
        specifier = specifier.replace('/dist/', '/src/').replace(/\.js$/, '.ts');
      } else {
        specifier = specifier.replace(/\.js$/, '.ts');
      }
    }
  }

  return nextResolve(specifier, context);
}
