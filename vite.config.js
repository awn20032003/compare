import { defineConfig } from "vite";
export default defineConfig({
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 1600 },
  server: { host: "0.0.0.0" },
});
