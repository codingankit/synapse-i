import { defineConfig } from "tsup";

// Only bundle this app's own source. Everything in package.json
// "dependencies" (including the workspace package @synapse/core) stays
// external and is resolved from node_modules at runtime.
export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  sourcemap: true,
  clean: true,
});
