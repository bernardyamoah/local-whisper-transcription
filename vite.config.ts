import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  server: {
    port: 3000,
    proxy: {
      "/api": "http://127.0.0.1:8765",
      "/static": "http://127.0.0.1:8765",
    },
  },
  plugins: [
    tanstackStart({
      spa: { enabled: true },
    }),
    viteReact(),
  ],
});
