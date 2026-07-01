import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

const useHttps = process.env.VITE_DEV_HTTPS === "1";
const certDir = path.resolve(__dirname, "..", "certs");
const httpsConfig = useHttps
  ? {
      key: fs.readFileSync(path.join(certDir, "translation-bot.key")),
      cert: fs.readFileSync(path.join(certDir, "translation-bot.crt")),
    }
  : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    https: httpsConfig,
  },
});
