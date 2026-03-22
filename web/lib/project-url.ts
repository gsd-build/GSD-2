export function buildProjectPath(path: string, projectCwd?: string): string {
  if (!projectCwd) return path
  const url = new URL(path, "http://localhost")
  url.searchParams.set("project", projectCwd)
  return url.pathname + url.search
}

export function buildProjectAbsoluteUrl(path: string, origin: string, projectCwd?: string): URL {
  return new URL(buildProjectPath(path, projectCwd), origin)
}
