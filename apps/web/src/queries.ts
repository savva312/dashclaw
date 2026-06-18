export const runtimeKeys = {
  all: ["runtime"] as const,
  snapshot: () => [...runtimeKeys.all, "snapshot"] as const,
  timeline: (limit = 200) => [...runtimeKeys.all, "timeline", limit] as const,
  audit: () => [...runtimeKeys.all, "audit"] as const,
  sessionPreview: (key: string) => [...runtimeKeys.all, "sessionPreview", key] as const,
};

export const RUNTIME_POLL_MS = 3_000;
export const TIMELINE_LIMIT = 200;
