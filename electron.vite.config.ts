import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
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
    plugins: [react(), tailwindcss()],
    // shadcn/ui components import from "@/components/ui/*" and "@/lib/utils".
    resolve: { alias: { "@": resolve("desktop/renderer") } },
    build: {
      outDir: resolve("desktop-out/renderer"),
      // The CSP has no font-src data:, so every asset must ship as a file.
      assetsInlineLimit: 0,
      rollupOptions: { input: resolve("desktop/renderer/index.html") },
    },
  },
});
