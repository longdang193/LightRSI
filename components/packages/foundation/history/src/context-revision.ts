import { createHash } from "node:crypto";

import { normalizeContextItemContent } from "./context-item-id.js";

export const CONTEXT_REVISION_ALGORITHM_VERSION = 1 as const;

export type ContextRevisionItem = {
  stableId: string;
  fingerprint: string;
};

function requiredRevisionPart(value: string, name: string, index: number): string {
  if (!value.trim()) {
    throw new TypeError(`context revision item ${index} ${name} must not be empty`);
  }
  return value;
}

export function createContextRevision(
  items: readonly ContextRevisionItem[],
): string {
  const revisionItems = items.map((item, index) => ({
    stableId: requiredRevisionPart(item.stableId, "stableId", index),
    fingerprint: requiredRevisionPart(item.fingerprint, "fingerprint", index),
  }));
  const digest = createHash("sha256")
    .update(normalizeContextItemContent({
      algorithmVersion: CONTEXT_REVISION_ALGORITHM_VERSION,
      items: revisionItems,
    }))
    .digest("hex");
  return `ctxrev-v${CONTEXT_REVISION_ALGORITHM_VERSION}-${digest}`;
}
