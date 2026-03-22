import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(webRoot, '..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['@gsd/native', 'node-pty'],
  // NodeNext-style .js extension imports in src/ must resolve to .ts source.
  // Turbopack doesn't support extensionAlias, so builds use --webpack flag.
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    // Webpack swallows `node:module` imports because it treats `module` as an
    // internal concept.  We need createRequire to survive into the server
    // bundle so node-pty (a native addon) can be loaded at runtime.
    if (isServer) {
      config.externals = config.externals || [];
      // Next.js already makes externals an array of functions/regexps — append
      // a simple object entry so `require("node:module")` passes through.
      config.externals.push({
        'node:module': 'commonjs node:module',
        // @gsd/native is a native addon loaded via runtime require().
        // serverExternalPackages handles the top-level import, but webpack
        // still tries to resolve the bare specifier inside files traced from
        // src/ (outside web/). Explicitly externalize it.
        '@gsd/native': 'commonjs @gsd/native',
      });
    }
    return config;
  },
}

export default nextConfig
