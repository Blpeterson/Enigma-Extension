import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "chrome120",
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/content/index.ts",
      formats: ["iife"],
      name: "DriveVaultContent",
      fileName: () => "content.js",
    },
  },
});
