import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function writeTempOutputFile(
  output: string,
  options: { prefix: string; filename?: string } = { prefix: "extension-output-" },
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), options.prefix));
  const filePath = join(dir, options.filename ?? "output.txt");
  await writeFile(filePath, output, "utf8");
  return filePath;
}
