import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/audit.ts",
    "src/context.ts",
    "src/ingest.ts",
    "src/memory.ts",
  ],
  format: ["esm"],
  platform: "node",
  target: "node22",
  dts: true,
  sourcemap: true,
  clean: true,
});
