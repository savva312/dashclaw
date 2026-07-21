/**
 * Conservative, process-local runtime limits.
 *
 * These are security boundaries, not pagination preferences. Keep changes
 * coordinated with docs/runtime-limits.md and boundary tests.
 */
export const RUNTIME_LIMITS = {
  gateway: {
    maxFrameBytes: 512 * 1024,
    maxJsonDepth: 24,
    maxJsonNodes: 10_000,
    maxObjectKeys: 256,
    maxArrayItems: 1_000,
    maxPendingRequests: 128,
    maxEventsPerSecond: 250,
  },
  http: {
    maxJsonBodyBytes: 64 * 1024,
    timelineDefault: 200,
    timelineMax: 500,
    auditMax: 200,
  },
  sse: {
    maxClients: 32,
    maxPendingWritesPerClient: 16,
    maxEventBytes: 128 * 1024,
    keepAliveMs: 15_000,
    maxConnectionMs: 5 * 60_000,
  },
  storage: {
    maxTimelineRows: 10_000,
    maxAuditRows: 5_000,
    maxTimelinePayloadBytes: 16 * 1024,
    maxTimelineTitleChars: 512,
    maxTimelineSummaryChars: 50_000,
    maxAuditFieldChars: 4_000,
    maxSnapshotBytes: 512 * 1024,
    highWaterBytes: 256 * 1024 * 1024,
  },
  browser: {
    maxApiResponseBytes: 1024 * 1024,
    maxSseEventBytes: 128 * 1024,
    maxRawPreviewChars: 10_000,
    maxSnapshotItemsPerCollection: 500,
    maxRenderedGraphNodes: 200,
    maxSessionPreviewItems: 50,
    maxCronRuns: 200,
  },
} as const;
