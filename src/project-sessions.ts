import { join } from "node:path"

import { sessionsDir as defaultSessionsDir } from "./app-paths.js"

export function getProjectSessionsDir(cwd: string, baseSessionsDir = defaultSessionsDir): string {
  const safePath = `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`
  return join(baseSessionsDir, safePath)
}
