import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:7033",
      "/health": "http://localhost:7033",
      "/ws": { target: "ws://localhost:7034", ws: true },
    },
  },
});
