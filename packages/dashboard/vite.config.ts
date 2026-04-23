import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxyPort = process.env.CONDUIT_PORT || "7133";
const target = `http://localhost:${proxyPort}`;
const wsTarget = `ws://localhost:${proxyPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": target,
      "/health": target,
      "/ws": { target: wsTarget, ws: true },
    },
  },
});
