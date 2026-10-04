import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  main: {
    build: {
      outDir: "desktop-out/main",
      rollupOptions: {
        input: resolve("desktop/main/index.ts"),
        external: ["electron"],
        output: { format: "es", entryFileNames: "index.mjs" },
      },
    },
  },
  preload: {
    build: {
      outDir: "desktop-out/preload",
      rollupOptions: {
        input: resolve("desktop/preload/index.ts"),
        external: ["electron"],
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    root: "desktop/renderer",
    plugins: [react()],
    build: {
      outDir: resolve("desktop-out/renderer"),
      rollupOptions: { input: resolve("desktop/renderer/index.html") },
    },
  },
});
