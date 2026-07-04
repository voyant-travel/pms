/**
 * Build the `SourceAdapterRegistry` used by the source discovery sync CLI
 * (`scripts/sync-sources.ts`). Extracted so tests can assert the registry wiring
 * — demo + Connect adapters — without executing the CLI's DB/Typesense side
 * effects.
 *
 * Mirrors the live booking-engine registry (`src/api/lib/booking-engine-runtime.ts`),
 * so sync covers the identical set of providers the admin/public/content/booking
 * paths see. (This stays-only PMS carries no cruise vertical.)
 */

import {
  createSourceAdapterRegistry,
  type SourceAdapterRegistry,
} from "@voyant-travel/catalog/booking-engine"
import { createDemoCatalogAdapter } from "@voyant-travel/plugin-catalog-demo"
import {
  prepareVoyantConnectSources,
  registerVoyantConnectSources,
} from "@voyant-travel/plugin-voyant-connect"

const DEMO_CATALOG_VERTICALS = ["products", "accommodations"] as const

export async function buildSyncSourceRegistry(
  env: NodeJS.ProcessEnv,
): Promise<SourceAdapterRegistry> {
  const registry = createSourceAdapterRegistry()

  const catalogDemoUrl = env.CATALOG_DEMO_API_URL
  if (catalogDemoUrl) {
    registry.register(
      createDemoCatalogAdapter({
        baseUrl: catalogDemoUrl,
        verticals: DEMO_CATALOG_VERTICALS,
      }),
    )
  }

  // Voyant Connect: enumerate the operator's active connections and register one
  // adapter set per connection, keyed by connection id. Env resolution is shared
  // with the live booking-engine registry via `prepareVoyantConnectSources` so the
  // two paths can't drift.
  registerVoyantConnectSources(
    registry,
    await prepareVoyantConnectSources(env, {
      enumerate: true,
      warn: (message) => console.warn(`[sync-sources] ${message}`),
    }),
  )

  return registry
}
