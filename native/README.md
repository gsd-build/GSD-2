# GSD Native Engine

Rust N-API addon providing high-performance native modules for GSD.

## Architecture

```
JS (packages/native) -> N-API -> Rust crates
                                  ├── engine/  (N-API bindings, cdylib)
                                  └── grep/    (ripgrep internals, pure Rust lib)
```

Inspired by [Oh My Pi's pi-natives](https://github.com/can1357/oh-my-pi), adapted for GSD's Node.js runtime.

## Prerequisites

- **Rust** (stable, 1.70+): https://rustup.rs
- **Node.js** (20.6+)

## Build

```bash
# Release build (optimized)
npm run build:native

# Debug build (fast compile, no optimizations)
npm run build:native:dev
```

The build script compiles the Rust code and copies the `.node` shared library to `native/addon/`.

## Test

```bash
# Rust unit tests
cd native && cargo test

# Node.js integration tests
npm run test:native
```

## Modules

### grep

Ripgrep-backed regex search using the `grep-regex`, `grep-searcher`, and `grep-matcher` crates.

**Functions:**

- `search(content, options)` — Search in-memory Buffer/Uint8Array content
- `grep(options)` — Search files on disk with glob filtering and .gitignore support

**TypeScript usage:**

```typescript
import { grep, searchContent } from "@gsd/native";

// Search files
const result = grep({
  pattern: "TODO",
  path: "./src",
  glob: "*.ts",
  ignoreCase: true,
  maxCount: 100,
});

// Search content
const contentResult = searchContent(Buffer.from(fileContent), {
  pattern: "function\\s+\\w+",
  contextBefore: 2,
  contextAfter: 2,
});
```

## Adding New Modules

1. Create a new crate in `native/crates/` (pure Rust library)
2. Add N-API bindings in `native/crates/engine/src/`
3. Add TypeScript wrapper in `packages/native/src/`
4. Add the crate to `engine/Cargo.toml` dependencies
