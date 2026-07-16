export interface ActionableErrorParts {
  happened: string;
  reason: string;
  action: string;
  support: string;
}

/** UI constitution §13: errors state what happened, why, what to do now, and where to ask for help. */
export function formatActionableError(parts: ActionableErrorParts): string {
  return `發生什麼：${parts.happened}\n為什麼：${parts.reason}\n現在能做什麼：${parts.action}\n需要幫忙：${parts.support}`;
}
