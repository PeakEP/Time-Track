import { defineConfig } from "vite";

export default defineConfig({
  base: "/vendor-orders/",
  // Shown in the footer so you can tell which version a browser is running.
  // COMMIT_REF is set by Netlify during builds.
  define: {
    __BUILD_ID__: JSON.stringify((process.env.COMMIT_REF || "local").slice(0, 7)),
  },
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
