import {
  clearCruiseAdapters,
  MockCruiseAdapter,
  resolveCruiseAdapter,
} from "@voyant-travel/cruises"
import { cruiseAdapterToSourceAdapter } from "@voyant-travel/cruises/adapters"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { resetConfiguredCruiseAdapters } from "../../src/api/lib/cruise-adapters-runtime.js"

// The Connect mock returns a real cruise shim (so the seam's `.cruiseAdapter`
// back-fill works and the kind is `cruise:connect`). The factory runs lazily at
// dynamic-import time, after the top-level imports above have initialized.
vi.mock("@voyant-travel/plugin-catalog-demo", () => ({
  createDemoCatalogAdapter: ({ baseUrl }: { baseUrl: string }) => ({
    kind: `demo:${baseUrl}`,
  }),
}))

vi.mock("@voyant-travel/plugin-voyant-connect", () => ({
  prepareVoyantConnectSources: vi.fn(async () => [
    {
      connectionId: "conn_1",
      adapter: cruiseAdapterToSourceAdapter(new MockCruiseAdapter({ name: "connect" })),
    },
  ]),
  registerVoyantConnectSources: (
    registry: { register: (a: unknown, b?: unknown) => void },
    sources: Array<{ connectionId?: string; adapter: unknown }>,
  ) => {
    for (const source of sources) {
      if (source.connectionId) registry.register(source.connectionId, source.adapter)
      else registry.register(source.adapter)
    }
  },
}))

beforeEach(() => {
  clearCruiseAdapters()
  resetConfiguredCruiseAdapters()
})

describe("buildSyncSourceRegistry", () => {
  it("registers demo + Connect cruise adapters and back-fills the vertical plane", async () => {
    const { buildSyncSourceRegistry } = await import("./build-sync-source-registry")

    const registry = await buildSyncSourceRegistry({
      CATALOG_DEMO_API_URL: "http://demo.test",
    } as NodeJS.ProcessEnv)

    // Catalog plane: demo + the Connect cruise kind are present.
    expect(registry.hasKind("demo:http://demo.test")).toBe(true)
    expect(registry.hasKind("cruise:connect")).toBe(true)
    // Vertical plane: the Connect cruise adapter was back-filled via the shared
    // `registerCruiseAdapters` seam — sync covers the same providers as the
    // admin/public/content/booking paths.
    expect(resolveCruiseAdapter("connect")).toBeDefined()
  })

  it("is a no-op for cruises when only the demo source is configured", async () => {
    const { prepareVoyantConnectSources } = await import("@voyant-travel/plugin-voyant-connect")
    vi.mocked(prepareVoyantConnectSources).mockResolvedValueOnce([])

    const { buildSyncSourceRegistry } = await import("./build-sync-source-registry")
    const registry = await buildSyncSourceRegistry({
      CATALOG_DEMO_API_URL: "http://demo.test",
    } as NodeJS.ProcessEnv)

    expect(registry.hasKind("demo:http://demo.test")).toBe(true)
    expect(registry.kinds().some((k) => k.startsWith("cruise:"))).toBe(false)
    expect(resolveCruiseAdapter("connect")).toBeUndefined()
  })
})
