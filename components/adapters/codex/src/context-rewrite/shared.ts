export function cloneJson<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value)) as T;
}

export function stableInputKey(item: unknown): string {
  return JSON.stringify(item);
}
