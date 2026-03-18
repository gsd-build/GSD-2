import { execFileSync } from "child_process";

const binary = process.env.GSD_SMOKE_BINARY || "npx";
const args = process.env.GSD_SMOKE_BINARY
  ? ["--version"]
  : ["gsd-pi", "--version"];

const output = execFileSync(binary, args, {
  encoding: "utf8",
  timeout: 30_000,
}).trim();

if (!/^\d+\.\d+\.\d+/.test(output)) {
  console.error(`Version output does not match expected pattern: "${output}"`);
  process.exit(1);
}
