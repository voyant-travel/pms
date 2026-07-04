import { clearChannelPushDeps } from "@voyant-travel/distribution/channel-push-workflows"
import { __resetRegistry } from "@voyant-travel/workflows"
import { afterEach, describe, expect, it, vi } from "vitest"

// Generous: this import pulls in the whole workflow module graph and is slow
// under the concurrent full-suite run (observed >15s under CPU contention).
const workflowImportTimeoutMs = 30_000

afterEach(() => {
  clearChannelPushDeps()
  __resetRegistry()
  vi.resetModules()
  vi.unstubAllEnvs()
})

describe("operator workflow entry", () => {
  it(
    "imports without blocking module evaluation",
    async () => {
      vi.stubEnv("DATABASE_URL", "postgres://example.invalid/voyant")

      await expect(
        Promise.race([
          import("./workflows.js"),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("workflow entry import timed out")),
              workflowImportTimeoutMs,
            ),
          ),
        ]),
      ).resolves.toBeDefined()
    },
    workflowImportTimeoutMs,
  )

  it("bootstraps channel-push deps without opening the db client", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://example.invalid/voyant")

    const { createLazyWorkflowDb } = await import("./workflows.js")
    let dbCreated = 0
    const db = createLazyWorkflowDb(() => {
      dbCreated += 1
      return {
        select: vi.fn(() => "selected"),
      }
    })

    expect(dbCreated).toBe(0)
    expect(db.select()).toBe("selected")
    expect(dbCreated).toBe(1)
  })

  it(
    "resolves workflow bootstrap with an unreachable database url",
    async () => {
      vi.stubEnv("DATABASE_URL", "postgres://example.invalid/voyant")

      const { bootstrapWorkflowBundle } = await import("./workflows.js")

      await expect(
        Promise.race([
          bootstrapWorkflowBundle(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("workflow bootstrap timed out")),
              workflowImportTimeoutMs,
            ),
          ),
        ]),
      ).resolves.toBeUndefined()
    },
    workflowImportTimeoutMs,
  )
})
