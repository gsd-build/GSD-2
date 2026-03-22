import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageJsonPath = resolve(import.meta.dirname, "../../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
  scripts?: Record<string, string>;
};

test("gsd:web rebuilds bundled resources before launching the packaged web host", () => {
  const script = packageJson.scripts?.["gsd:web"];
  assert.ok(script, "package.json must define a gsd:web script");
  assert.match(script, /npm run copy-resources/, "gsd:web must refresh dist/resources so packaged web hosts do not serve stale GSD extensions");
});
