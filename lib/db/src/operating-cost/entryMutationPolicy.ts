export type EntryTripStatus = "PLANNING" | "ACTIVE" | "CLOSED";
export type EntryMode = "ESTIMATE" | "ACTUAL";

export interface EntryMutationContext {
  tripStatus: EntryTripStatus;
  entryMode: EntryMode;
  estimateLocked: boolean;
}

function blockedByEstimateLock(context: EntryMutationContext): boolean {
  return context.entryMode === "ESTIMATE" && context.estimateLocked;
}

export function canEditEntry(context: EntryMutationContext): boolean {
  return context.tripStatus !== "CLOSED" && !blockedByEstimateLock(context);
}

export function canDeleteEntry(context: EntryMutationContext): boolean {
  return context.tripStatus !== "CLOSED" && !blockedByEstimateLock(context);
}

export function canVoidEntry(context: EntryMutationContext): boolean {
  return !blockedByEstimateLock(context);
}

export interface EstimateLockState {
  estimateLocked: boolean;
  estimateModifiedAfterLock: boolean;
}

export function unlockEstimate(state: EstimateLockState): EstimateLockState {
  if (!state.estimateLocked) return state;
  return {
    estimateLocked: false,
    estimateModifiedAfterLock: true,
  };
}
