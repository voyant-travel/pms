import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import {
  createAnalyzePlugin,
  VOYANT_ROUTE_FILE_IGNORE_PATTERN,
  voyantStartViteConfig,
} from "@voyant-travel/vite-config"
import { defineConfig } from "vite"

// Load-bearing build config (vendor chunking, SSR optimizeDeps, dev-tunnel
// hosts, `@` alias) is versioned in @voyant-travel/vite-config; this file only
// instantiates the app's plugins.
export default defineConfig(
  voyantStartViteConfig({
    appRootUrl: import.meta.url,
    plugins: [
      devtools(),
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      tailwindcss(),
      tanstackStart({
        router: {
          routeFileIgnorePattern: VOYANT_ROUTE_FILE_IGNORE_PATTERN,
        },
      }),
      viteReact(),
      // Opt-in: `ANALYZE=1 pnpm build` emits dist/stats.html with a treemap
      // of all client chunks.
      createAnalyzePlugin(import.meta.url),
    ],
  }),
)
