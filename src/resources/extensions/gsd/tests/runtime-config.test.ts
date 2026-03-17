// Tests for parseRuntimeConfig() and formatRuntimeConfig() — the RUNTIME.md
// stack contract parser and formatter.
//
// Sections:
//   (a) Single web app with port readiness
//   (b) HTTP health check readiness
//   (c) CLI tool with command readiness
//   (d) Daemon with file-exists readiness
//   (e) Multi-service config with H3 scoping
//   (f) Minimal config
//   (g) Empty content
//   (h) Malformed content
//   (i) Roundtrip fidelity
//   (j) Environment section
//   (k) Readiness fallback

import { parseRuntimeConfig, formatRuntimeConfig } from '../files.ts';
import type { RuntimeConfig } from '../types.ts';
import { createTestContext } from './test-helpers.ts';

const { assertEq, assertTrue, report } = createTestContext();

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {

  // ─── (a) Single web app with port readiness ────────────────────────────
  console.log('\n── (a) Single web app with port readiness');
  {
    const md = `# Runtime Stack Contract

## Environment

## Services

### Web App

**Command:** npm start
**Ready when:** port 3000 is open
**Port:** 3000

## Seed

## Preview URLs

## Teardown
`;
    const config = parseRuntimeConfig(md);
    assertTrue(config !== undefined, 'config should be defined');
    assertEq(config!.services.length, 1, 'should have 1 service');
    assertEq(config!.services[0].name, 'Web App', 'service name');
    assertEq(config!.services[0].command, 'npm start', 'service command');
    assertTrue(config!.services[0].readiness !== undefined, 'readiness should be defined');
    assertEq(config!.services[0].readiness!.type, 'port', 'readiness type is port');
    // Parser extracts "3000 is open" after slicing off "port" prefix
    assertTrue(config!.services[0].readiness!.value.includes('3000'), 'readiness value contains 3000');
    assertEq(config!.services[0].port, 3000, 'port is 3000');
  }

  // ─── (b) HTTP health check readiness ───────────────────────────────────
  console.log('\n── (b) HTTP health check readiness');
  {
    const md = `# Runtime Stack Contract

## Services

### API Server

**Command:** node server.js
**Ready when:** HTTP 200 at http://localhost:3000/health
**Port:** 3000
`;
    const config = parseRuntimeConfig(md);
    assertTrue(config !== undefined, 'config should be defined');
    assertEq(config!.services[0].readiness!.type, 'http', 'readiness type is http');
    assertTrue(
      config!.services[0].readiness!.value.includes('http://localhost:3000/health'),
      'readiness value contains health URL',
    );
  }

  // ─── (c) CLI tool with command readiness ───────────────────────────────
  console.log('\n── (c) CLI tool with command readiness');
  {
    const md = `# Runtime Stack Contract

## Services

### Redis

**Command:** redis-server
**Ready when:** command exits 0: redis-cli ping
`;
    const config = parseRuntimeConfig(md);
    assertTrue(config !== undefined, 'config should be defined');
    assertEq(config!.services[0].readiness!.type, 'command', 'readiness type is command');
    assertTrue(
      config!.services[0].readiness!.value.includes('exits 0: redis-cli ping'),
      'readiness value contains the command',
    );
  }

  // ─── (d) Daemon with file-exists readiness ─────────────────────────────
  console.log('\n── (d) Daemon with file-exists readiness');
  {
    const md = `# Runtime Stack Contract

## Services

### App Daemon

**Command:** ./bin/daemon start
**Ready when:** file exists at /var/run/app.pid
`;
    const config = parseRuntimeConfig(md);
    assertTrue(config !== undefined, 'config should be defined');
    assertEq(config!.services[0].readiness!.type, 'file', 'readiness type is file');
    assertTrue(
      config!.services[0].readiness!.value.includes('/var/run/app.pid'),
      'readiness value contains the pid file path',
    );
  }

  // ─── (e) Multi-service config with H3 scoping ─────────────────────────
  console.log('\n── (e) Multi-service config with H3 scoping');
  {
    const md = `# Runtime Stack Contract

**Project:** my-stack

## Environment

- DATABASE_URL=postgres://localhost/mydb
- REDIS_URL=redis://localhost:6379

## Services

### Web

**Command:** npm run dev
**Ready when:** port 3000
**Port:** 3000

### Database

**Command:** docker compose up postgres
**Ready when:** port 5432
**Port:** 5432

### Worker

**Command:** npm run worker
**Ready when:** command exits 0: curl -s http://localhost:3001/ready

## Seed

1. npm run db:migrate
2. npm run db:seed

## Preview URLs

- App: http://localhost:3000
- Admin: http://localhost:3000/admin

## Teardown

1. docker compose down
`;
    const config = parseRuntimeConfig(md);
    assertTrue(config !== undefined, 'config should be defined');

    // Services count — must be exactly 3 (H3s under ## Services only)
    assertEq(config!.services.length, 3, 'should have exactly 3 services');
    assertEq(config!.services[0].name, 'Web', 'first service name');
    assertEq(config!.services[1].name, 'Database', 'second service name');
    assertEq(config!.services[2].name, 'Worker', 'third service name');

    // Port parsing
    assertEq(config!.services[0].port, 3000, 'Web port');
    assertEq(config!.services[1].port, 5432, 'Database port');

    // Worker readiness — complex command probe
    assertEq(config!.services[2].readiness!.type, 'command', 'Worker readiness type');

    // Environment
    assertEq(config!.environment.length, 2, 'should have 2 environment entries');
    assertTrue(config!.environment[0].includes('DATABASE_URL'), 'first env is DATABASE_URL');

    // Seed
    assertEq(config!.seed.length, 2, 'should have 2 seed commands');
    assertEq(config!.seed[0], 'npm run db:migrate', 'first seed command');
    assertEq(config!.seed[1], 'npm run db:seed', 'second seed command');

    // Preview URLs
    assertEq(config!.previewUrls.length, 2, 'should have 2 preview URLs');
    assertEq(config!.previewUrls[0].name, 'App', 'first preview name');
    assertEq(config!.previewUrls[0].url, 'http://localhost:3000', 'first preview URL');
    assertEq(config!.previewUrls[1].name, 'Admin', 'second preview name');

    // Teardown
    assertEq(config!.teardown.length, 1, 'should have 1 teardown command');
    assertEq(config!.teardown[0], 'docker compose down', 'teardown command');

    // Project name
    assertEq(config!.project, 'my-stack', 'project name');
  }

  // ─── (f) Minimal config ────────────────────────────────────────────────
  console.log('\n── (f) Minimal config');
  {
    const md = `# Runtime Stack Contract

## Services

### CLI Tool

**Command:** python main.py
`;
    const config = parseRuntimeConfig(md);
    assertTrue(config !== undefined, 'config should be defined');
    assertEq(config!.services.length, 1, 'should have 1 service');
    assertEq(config!.services[0].name, 'CLI Tool', 'service name');
    assertEq(config!.services[0].command, 'python main.py', 'service command');
    assertTrue(config!.services[0].readiness === undefined, 'readiness should be undefined');
    assertEq(config!.seed.length, 0, 'seed should be empty');
    assertEq(config!.previewUrls.length, 0, 'previewUrls should be empty');
    assertEq(config!.teardown.length, 0, 'teardown should be empty');
  }

  // ─── (g) Empty content ─────────────────────────────────────────────────
  console.log('\n── (g) Empty content');
  {
    assertEq(parseRuntimeConfig(''), undefined, 'empty string returns undefined');
    assertEq(parseRuntimeConfig(undefined as any), undefined, 'undefined returns undefined');
    assertEq(parseRuntimeConfig('   \n\n  '), undefined, 'whitespace-only returns undefined');
  }

  // ─── (h) Malformed content ─────────────────────────────────────────────
  console.log('\n── (h) Malformed content');
  {
    // No Services section at all
    const noServices = `# Runtime Stack Contract

## Environment

- FOO=bar

## Seed

1. echo hello
`;
    const result = parseRuntimeConfig(noServices);
    assertEq(result, undefined, 'no Services section returns undefined');

    // Services section exists but has no H3 children
    const emptyServices = `# Runtime Stack Contract

## Services

Nothing configured yet.

## Seed
`;
    const result2 = parseRuntimeConfig(emptyServices);
    assertTrue(result2 !== undefined, 'empty Services section still returns config');
    assertEq(result2!.services.length, 0, 'empty Services has 0 services');

    // Random markdown gibberish — should not throw
    let didThrow = false;
    try {
      parseRuntimeConfig('# Just a heading\n\nSome random text\n\n- bullet');
    } catch {
      didThrow = true;
    }
    assertTrue(!didThrow, 'gibberish markdown should not throw');
  }

  // ─── (i) Roundtrip fidelity ────────────────────────────────────────────
  console.log('\n── (i) Roundtrip fidelity');
  {
    const original: RuntimeConfig = {
      project: 'roundtrip-test',
      services: [
        {
          name: 'Frontend',
          command: 'npm run dev',
          readiness: { type: 'port', value: '3000' },
          port: 3000,
        },
        {
          name: 'Backend',
          command: 'cargo run',
          readiness: { type: 'http', value: 'http://localhost:8080/healthz' },
          port: 8080,
          healthUrl: 'http://localhost:8080/healthz',
        },
        {
          name: 'Worker',
          command: 'python worker.py',
          readiness: { type: 'command', value: 'curl -s http://localhost:9090' },
        },
      ],
      environment: [
        'DATABASE_URL=postgres://localhost/test',
        'API_KEY=abc123',
      ],
      seed: [
        'npm run db:migrate',
        'npm run db:seed',
      ],
      previewUrls: [
        { name: 'App', url: 'http://localhost:3000' },
        { name: 'API', url: 'http://localhost:8080' },
      ],
      teardown: [
        'docker compose down',
        'rm -rf tmp/',
      ],
    };

    const formatted = formatRuntimeConfig(original);
    const parsed = parseRuntimeConfig(formatted);

    assertTrue(parsed !== undefined, 'roundtrip: parsed should be defined');
    assertEq(parsed!.project, original.project, 'roundtrip: project name');
    assertEq(parsed!.services.length, original.services.length, 'roundtrip: service count');

    // Verify each service roundtrips
    for (let i = 0; i < original.services.length; i++) {
      const orig = original.services[i];
      const rt = parsed!.services[i];
      assertEq(rt.name, orig.name, `roundtrip: service[${i}] name`);
      assertEq(rt.command, orig.command, `roundtrip: service[${i}] command`);
      assertEq(rt.readiness?.type, orig.readiness?.type, `roundtrip: service[${i}] readiness type`);
      if (orig.port !== undefined) {
        assertEq(rt.port, orig.port, `roundtrip: service[${i}] port`);
      }
    }

    // Roundtrip for seed, preview, teardown
    assertEq(parsed!.seed.length, original.seed.length, 'roundtrip: seed count');
    assertEq(parsed!.seed[0], original.seed[0], 'roundtrip: seed[0]');
    assertEq(parsed!.previewUrls.length, original.previewUrls.length, 'roundtrip: preview count');
    assertEq(parsed!.previewUrls[0].name, original.previewUrls[0].name, 'roundtrip: preview[0] name');
    assertEq(parsed!.previewUrls[0].url, original.previewUrls[0].url, 'roundtrip: preview[0] url');
    assertEq(parsed!.teardown.length, original.teardown.length, 'roundtrip: teardown count');
    assertEq(parsed!.teardown[0], original.teardown[0], 'roundtrip: teardown[0]');
    assertEq(parsed!.environment.length, original.environment.length, 'roundtrip: env count');
    assertEq(parsed!.environment[0], original.environment[0], 'roundtrip: env[0]');
  }

  // ─── (j) Environment section ───────────────────────────────────────────
  console.log('\n── (j) Environment section');
  {
    // Populated environment
    const md = `# Runtime Stack Contract

## Environment

- NODE_ENV=development
- PORT=3000
- SECRET_KEY=s3cret

## Services

### App

**Command:** node index.js
`;
    const config = parseRuntimeConfig(md);
    assertTrue(config !== undefined, 'config with env should be defined');
    assertEq(config!.environment.length, 3, 'should have 3 env entries');
    assertEq(config!.environment[0], 'NODE_ENV=development', 'first env entry');
    assertEq(config!.environment[1], 'PORT=3000', 'second env entry');
    assertEq(config!.environment[2], 'SECRET_KEY=s3cret', 'third env entry');

    // Empty environment section
    const mdEmpty = `# Runtime Stack Contract

## Environment

## Services

### App

**Command:** node index.js
`;
    const config2 = parseRuntimeConfig(mdEmpty);
    assertTrue(config2 !== undefined, 'config with empty env should be defined');
    assertEq(config2!.environment.length, 0, 'empty env section returns empty array');
  }

  // ─── (k) Readiness fallback ────────────────────────────────────────────
  console.log('\n── (k) Readiness fallback');
  {
    const md = `# Runtime Stack Contract

## Services

### Mystery Service

**Command:** ./start.sh
**Ready when:** some-unknown-format that doesn't match any prefix
`;
    let didThrow = false;
    let config: ReturnType<typeof parseRuntimeConfig>;
    try {
      config = parseRuntimeConfig(md);
    } catch {
      didThrow = true;
    }
    assertTrue(!didThrow, 'unknown readiness format should not throw');
    assertTrue(config! !== undefined, 'config should be defined');
    assertEq(config!.services[0].readiness!.type, 'command', 'fallback readiness type is command');
    assertEq(
      config!.services[0].readiness!.value,
      "some-unknown-format that doesn't match any prefix",
      'fallback preserves full value string',
    );
  }

  // ─── Done ──────────────────────────────────────────────────────────────
  report();
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
