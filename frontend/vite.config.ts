import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const backendTarget = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Proksi/preview muhitlarda (masulan e2b) har qanday Host qabul qilinadi.
    allowedHosts: true,
    // API chaqiruvlari nisbiy (`/api/...`) — dev rejimda backendka proksi.
    // Host saqlanadi, shuning uchun backend'dagi same-origin tekshruvi o'tadi.
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: false,
        ws: false,
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
