import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");

  const serverPort = Number(process.env.DASHCLAW_PORT ?? env.DASHCLAW_PORT ?? "8090");
  const webPort = Number(process.env.VITE_PORT ?? env.VITE_PORT ?? "5173");
  const apiUrl = process.env.VITE_DASHCLAW_API_URL ?? env.VITE_DASHCLAW_API_URL ?? `http://127.0.0.1:${serverPort}`;

  return {
    plugins: [react()],
    envDir: repoRoot,
    envPrefix: ["VITE_", "DASHCLAW_"],
    server: {
      host: "127.0.0.1",
      port: webPort,
      proxy: {
        "/api": {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
