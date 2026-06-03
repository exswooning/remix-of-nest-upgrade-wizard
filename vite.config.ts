import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  // pdfjs-dist's worker script is a standalone bundle — feeding it
  // through Vite's dep optimizer breaks it (esbuild doesn't recognise
  // the entry, drops the file). Excluding both the main lib and the
  // worker means Vite serves them as-is. We still wire the worker URL
  // via ?url at import time in src/utils/pdfTools.ts.
  optimizeDeps: {
    exclude: ["pdfjs-dist", "pdfjs-dist/build/pdf.worker.min.mjs"],
  },
});
