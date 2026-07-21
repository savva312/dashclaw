# Runtime limits and retention policy

These limits are security boundaries. They intentionally favor a stable local
control plane over accepting unusually large or bursty runtime data. Constants
live in `packages/runtime-model/src/limits.ts`.

## Gateway

- Frames are limited to 512 KiB before JSON parsing. The Node `ws` transport
  enforces the same limit with `maxPayload`, before a complete frame reaches
  application parsing.
- Parsed JSON is limited to depth 24, 10,000 values, 256 keys per object, and
  1,000 items per array.
- The same shape and byte checks apply to outbound RPC frames.
- At most 128 Gateway RPCs may await responses at once.
- At most 250 pushed events are accepted per one-second process-local window.
  Excess events are dropped, with one payload-free diagnostic per window.
- These checks are independent of Gateway authentication and handshake
  semantics.

## HTTP and SSE

- API request bodies are limited to 64 KiB. Oversized bodies receive `413`.
- Timeline limits default to 200 and audit limits default to 100. Limits must
  be positive decimal safe integers; malformed, negative, fractional, zero,
  and non-finite values receive `400`. Large valid values are clamped to 500
  for timeline and 200 for audit.
- At most 32 SSE clients are active. Additional clients receive `503`.
- Each SSE client may queue 16 writes. A slow client that exceeds the queue
  budget is disconnected.
- Individual SSE events are limited to 128 KiB. Streams send a keepalive every
  15 seconds and rotate after five minutes so abandoned connections cannot
  remain indefinitely. Abort, write failure, overflow, and rotation all use
  the same idempotent cleanup path.

## SQLite

- The newest 10,000 timeline rows and 5,000 audit rows are retained by local
  ingestion/update order, so hostile remote timestamps cannot pin rows.
- Pruning runs in the same transaction as each insert or upsert. Startup also
  prunes databases created by older versions.
- Timeline payload JSON is limited to 16 KiB. Oversized payloads are replaced
  with a payload-free truncation marker; titles are limited to 512 characters.
- Timeline summaries retain the existing 50,000-character assistant bound.
  The existing 100 concurrent assistant-stream bound is unchanged.
- Persisted snapshots are limited to 512 KiB.
- Writes stop at 256 MiB of used SQLite pages. `/api/health` reports row counts,
  allocated bytes, used bytes, the high-water threshold, and degraded state
  without exposing the database path.
- Timeline and audit rows represent completed writes, not active operations.
  Assistant streams update one stable row and each upsert refreshes its
  retention order, so an actively growing response is retained.

## Browser

- API responses are streamed into at most 1 MiB before JSON parsing.
- API and SSE values are checked for bounded JSON shape and expected runtime
  schemas before entering TanStack Query caches.
- Snapshot collections are limited to 500 items each, session previews to 50
  items, cron runs to 200, and rendered work graphs to 200 nodes.
- Raw session, cron, and admin previews are limited to 10,000 characters.
- Invalid or excessive SSE events are ignored; bounded polling remains the
  authoritative recovery path.

## Validation policy

Boundary tests cover oversized/deep Gateway frames, event bursts, malformed
query limits, oversized request bodies, excess SSE clients and cleanup,
transactional retention, storage high-water behavior, malformed browser
payloads, excessive collections, and raw-preview truncation. The retention
load test uses a small configured row cap and near-limit payloads, then checks
both retained rows and used SQLite bytes to detect unbounded growth.
