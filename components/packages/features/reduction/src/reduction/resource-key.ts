export type ResourceKeyParts = {
  path: string;
  workspaceDir?: string;
  offset?: number;
  limit?: number;
};

export function resourceKey(parts: ResourceKeyParts | string): string {
  const value = typeof parts === "string" ? { path: parts } : parts;
  const path = value.path.trim().replaceAll("\\", "/");
  const workspaceDir = value.workspaceDir?.trim().replaceAll("\\", "/");
  if (!workspaceDir && value.offset === undefined && value.limit === undefined) return path;
  const window = value.offset !== undefined || value.limit !== undefined
    ? `${value.offset ?? ""}:${value.limit ?? ""}`
    : "";
  return `${workspaceDir ?? ""}\u0000${path}\u0000${window}`;
}
