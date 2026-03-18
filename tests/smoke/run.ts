import { readdirSync } from "fs";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const testFiles = readdirSync(__dirname)
  .filter((f) => f.startsWith("test-") && f.endsWith(".ts"))
  .sort();

if (testFiles.length === 0) {
  console.error("No smoke test files found");
  process.exit(1);
}

let passed = 0;
let failed = 0;

for (const file of testFiles) {
  const filePath = join(__dirname, file);
  const label = file.replace(/\.ts$/, "");
  try {
    execFileSync("node", ["--experimental-strip-types", filePath], {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 30_000,
    });
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (err: any) {
    console.error(`  FAIL  ${label}`);
    if (err.stdout) console.error(err.stdout);
    if (err.stderr) console.error(err.stderr);
    failed++;
  }
}

console.log(`\nSmoke tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
