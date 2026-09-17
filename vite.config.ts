import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = `http://127.0.0.1:${process.env.STUDIO_PORT || "8765"}`;

export default defineConfig({
  base: "/",
  resolve: { tsconfigPaths: true },
  server: {
    port: 3000,
    proxy: {
      "/api": backend,
      "/static": backend,
    },
  },
  plugins: [
    tanstackStart({
      spa: { enabled: true },
    }),
    viteReact(),
    tailwindcss(),
  ],
});
