import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "pages",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../github-pages",
    emptyOutDir: true,
    sourcemap: true,
  },
});
