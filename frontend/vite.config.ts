import tailwindcss from "@tailwindcss/postcss";
import vinext from "vinext";
import { defineConfig } from "vite";
// Self-hosted Node frontend; meeting data is proxied only to the local Python API.
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  plugins: [vinext()],
});
