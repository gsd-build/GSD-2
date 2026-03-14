import test from "node:test";
import assert from "node:assert/strict";
import { delimiter } from "node:path";
import {
  parseBundledExtensionPaths,
  serializeBundledExtensionPaths,
} from "../bundled-extension-paths.ts";

test("bundled extension paths use the platform delimiter by default", () => {
  const paths = ["/tmp/gsd/a.ts", "/tmp/gsd/b.ts"];
  const encoded = serializeBundledExtensionPaths(paths);

  assert.equal(encoded, paths.join(delimiter));
  assert.deepEqual(parseBundledExtensionPaths(encoded), paths);
});

test("bundled extension paths preserve Windows drive letters when semicolon-delimited", () => {
  const windowsPaths = [
    String.raw`C:\Users\dev\.gsd\agent\extensions\gsd\index.ts`,
    String.raw`D:\work\gsd\extensions\browser-tools\index.ts`,
  ];
  const encoded = serializeBundledExtensionPaths(windowsPaths, ";");

  assert.equal(encoded, windowsPaths.join(";"));
  assert.deepEqual(parseBundledExtensionPaths(encoded, ";"), windowsPaths);
});
