/**
 * Remote Questions — status helpers
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readPromptRecord } from "./store.js";
import { gsdHome } from "../gsd/gsd-home.js";

export interface LatestPromptSummary {
  id: string;
  status: string;
  updatedAt: number;
}

export function getLatestPromptSummary(): LatestPromptSummary | null {
  const runtimeDir = join(gsdHome(), "runtime", "remote-questions");
  if (!existsSync(runtimeDir)) return null;
  const files = readdirSync(runtimeDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) return null;

  let latest: LatestPromptSummary | null = null;
  for (const file of files) {
    const record = readPromptRecord(file.replace(/\.json$/, ""));
    if (!record) continue;
    if (!latest || record.updatedAt > latest.updatedAt) {
      latest = { id: record.id, status: record.status, updatedAt: record.updatedAt };
    }
  }
  return latest;
}
