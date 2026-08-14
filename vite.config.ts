import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  // Allow NEXT_PUBLIC_* (Vercel dashboard names) as well as VITE_*.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: {
    host: true,
    port: Number(process.env.PORT) || 3000,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Only isolate supabase / tanstack. Do NOT force recharts/pptx/excel
          // into shared chunks — that made them modulepreload on every reload.
          if (id.includes("node_modules/@supabase")) return "supabase";
          if (id.includes("node_modules/@tanstack")) return "tanstack";
        },
      },
    },
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Use src/server.ts (SSR error wrapper) as the server entry.
      server: { entry: "server" },
    }),
    nitro(),
    viteReact(),
    tailwindcss(),
  ],
});
