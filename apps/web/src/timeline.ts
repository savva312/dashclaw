import type { TimelineEvent } from "@dashclaw/runtime-model";

export function upsertTimelineEvent(
  current: TimelineEvent[] | undefined,
  event: TimelineEvent,
  limit: number,
): TimelineEvent[] {
  const base = current ?? [];
  const existingIndex = base.findIndex((candidate) => candidate.id === event.id);
  if (existingIndex >= 0) {
    const next = [...base];
    next[existingIndex] = event;
    return next.slice(-limit);
  }
  return [...base, event].slice(-limit);
}
