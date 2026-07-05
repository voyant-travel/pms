import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    passWithNoTests: true,
    // The workflow-import / route-mounting tests dynamically load the whole
    // operator module graph, which is slow under the concurrent full-suite run.
    // Give them headroom so they don't flake on the default 5s timeout.
    testTimeout: 30_000,
    server: {
      deps: {
        inline: [
          /@voyant-travel\/(catalog|connect-adapter|connect-cruises|connect-sdk|cruises|plugin-smartbill|plugin-voyant-connect)(\/.*)?/,
        ],
      },
    },
  },
})
