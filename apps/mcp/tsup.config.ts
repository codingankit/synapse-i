import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node24",
  sourcemap: true,
  clean: true,
  minify: false,
  bundle: true,
  noExternal: ["@synapse/core"],
});
