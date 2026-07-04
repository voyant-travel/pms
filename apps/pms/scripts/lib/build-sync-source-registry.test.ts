import { beforeEach, describe, expect, it, vi } from "vitest"

// This stays-only PMS carries no cruise vertical: the sync registry wires the
// demo catalog adapter plus any Connect connection-scoped adapters.
vi.mock("@voyant-travel/plugin-catalog-demo", () => ({
  createDemoCatalogAdapter: ({ baseUrl }: { baseUrl: string }) => ({
    kind: `demo:${baseUrl}`,
  }),
}))

vi.mock("@voyant-travel/plugin-voyant-connect", () => ({
  prepareVoyantConnectSources: vi.fn(async () => [
    {
      connectionId: "conn_1",
      adapter: { kind: "connect:conn_1" },
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
  vi.clearAllMocks()
})

describe("buildSyncSourceRegistry", () => {
  it("registers the demo adapter and the enumerated Connect sources", async () => {
    const { buildSyncSourceRegistry } = await import("./build-sync-source-registry")

    const registry = await buildSyncSourceRegistry({
      CATALOG_DEMO_API_URL: "http://demo.test",
    } as NodeJS.ProcessEnv)

    expect(registry.hasKind("demo:http://demo.test")).toBe(true)
    expect(registry.hasKind("connect:conn_1")).toBe(true)
  })

  it("registers only the demo adapter when Connect enumerates nothing", async () => {
    const { prepareVoyantConnectSources } = await import("@voyant-travel/plugin-voyant-connect")
    vi.mocked(prepareVoyantConnectSources).mockResolvedValueOnce([])

    const { buildSyncSourceRegistry } = await import("./build-sync-source-registry")
    const registry = await buildSyncSourceRegistry({
      CATALOG_DEMO_API_URL: "http://demo.test",
    } as NodeJS.ProcessEnv)

    expect(registry.hasKind("demo:http://demo.test")).toBe(true)
    expect(registry.hasKind("connect:conn_1")).toBe(false)
  })
})
