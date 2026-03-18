import { readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";

const pkgPath = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const shortSha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
const devVersion = `${pkg.version}-dev.${shortSha}`;

pkg.version = devVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log(`Stamped version: ${devVersion}`);
