export {
  DEFAULT_GATEWAY_SCOPES,
  GatewayClient,
  READ_ONLY_GATEWAY_SCOPES,
} from "./client.js";
export {
  GatewayFrameLimitError,
  assertJsonComplexity,
  parseGatewayFrame,
  serializeGatewayFrame,
} from "./frame-limits.js";
export {
  FAKE_GATEWAY_SCENARIOS,
  startFakeGateway,
  type FakeGatewayHandle,
  type FakeGatewayOptions,
  type FakeGatewayScenario,
} from "./fake-gateway.js";
export type {
  GatewayClientEvents,
  GatewayClientOptions,
  GatewayError,
  GatewayFrame,
  GatewayHandshakeState,
  HelloOkPayload,
} from "./types.js";
