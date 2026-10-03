import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // React hooks require one physical runtime. Workspace/peer installs can otherwise
    // make React Router and application code resolve different React copies in dev.
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react-router", "react-router-dom"],
  },
  server: { port: 5173 },
  build: {
    sourcemap: false,
    target: "es2022",
  },
});
