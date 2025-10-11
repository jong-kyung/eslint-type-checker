import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "eslint-plugin-typed-shape",
      fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: ["eslint", "typescript", "@typescript-eslint/parser", "@typescript-eslint/utils"],
    },
    sourcemap: true,
  },
  plugins: [
    dts({
      insertTypesEntry: true,
      outDir: "dist",
    }),
  ],
});
