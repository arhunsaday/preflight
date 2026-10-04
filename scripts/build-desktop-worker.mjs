import { build } from "esbuild";
await build({
  entryPoints: ["desktop/worker.ts"],
  outfile: "desktop-out/main/worker.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  logLevel: "info",
});
