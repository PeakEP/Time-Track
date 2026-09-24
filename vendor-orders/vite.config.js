import { defineConfig } from "vite";

export default defineConfig({
  base: "/vendor-orders/",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    port: 5175,
    // `netlify dev` serves the API; plain `vite` falls back to demo mode.
    proxy: { "/api": "http://localhost:8888" },
  },
});
