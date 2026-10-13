import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // Forward the engine-bridge API to the local bridge (npm run bridge),
    // matching how the Docker web container proxies /api to the bridge.
    proxy: {
      // @ts-expect-error process is a nodejs global
      // 127.0.0.1, not "localhost": the bridge listens on IPv4 loopback only, and
      // "localhost" can resolve to ::1 first.
      "/api": { target: process.env.BRIDGE_URL || "http://127.0.0.1:5174", changeOrigin: true },
    },
  },
}));
