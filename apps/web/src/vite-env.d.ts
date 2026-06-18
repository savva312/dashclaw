/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DASHCLAW_TOKEN?: string;
  readonly VITE_DASHCLAW_API_URL?: string;
  readonly VITE_PORT?: string;
  readonly DASHCLAW_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
