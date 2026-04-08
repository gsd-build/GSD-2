export function resolveSubagentLaunchModel(
  agentModel: string | undefined,
  preferredModel: string | undefined,
): string | undefined {
  const preferred = preferredModel?.trim();
  if (preferred) return preferred;

  const pinned = agentModel?.trim();
  return pinned || undefined;
}

export function formatSubagentModelLabel(
  agentModel: string | undefined,
  preferredModel: string | undefined,
): string {
  const resolved = resolveSubagentLaunchModel(agentModel, preferredModel);
  if (!resolved) return "";

  const preferred = preferredModel?.trim();
  const pinned = agentModel?.trim();
  if (preferred) {
    if (pinned && pinned !== preferred) {
      return `${preferred} via prefs; overrides ${pinned}`;
    }
    return `${preferred} via prefs`;
  }

  return resolved;
}
