import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"

import { clearChannelPushDeps } from "@voyant-travel/distribution/channel-push-workflows"
import { __resetRegistry } from "@voyant-travel/workflows"
import { afterEach, describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)

afterEach(() => {
  clearChannelPushDeps()
  __resetRegistry()
})

describe("compiled operator workflow bundle", () => {
  it("makes bootstrapped channel-push deps visible to channel workflow steps", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "voyant-workflow-bundle-"))
    try {
      await execFileAsync("pnpm", ["--filter", "@voyant-travel/workflows", "build"], {
        cwd: process.cwd(),
      })
      await execFileAsync(
        "pnpm",
        [
          "exec",
          "voyant",
          "workflows",
          "build",
          "--file",
          "src/workflows.ts",
          "--out",
          outDir,
          "--platform",
          "node",
        ],
        { cwd: process.cwd() },
      )

      const { stdout } = await execFileAsync(
        "pnpm",
        ["exec", "tsx", "--eval", bundleStepScript(outDir)],
        {
          cwd: process.cwd(),
          maxBuffer: 1024 * 1024,
        },
      )
      const result = JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}") as {
        result: unknown
        selectCalls: number
      }

      expect(result.result).toMatchObject({
        status: 200,
        body: {
          status: "completed",
          output: { attempted: 0, succeeded: 0, failed: 0, skipped: 0 },
        },
      })
      expect(result.selectCalls).toBe(1)
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  }, 90_000)
})

function bundleStepScript(outDir: string): string {
  const bundleUrl = pathToFileURL(join(outDir, "bundle.mjs")).href
  return `
;(async () => {
const bundle = await import(${JSON.stringify(bundleUrl)})
const { handleStepRequest } = await import("@voyant-travel/workflows/handler")
const { PROTOCOL_VERSION } = await import("@voyant-travel/workflows/protocol")

let selectCalls = 0
const db = {
  select() {
    selectCalls += 1
    return {
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [],
            }),
          }),
        }),
      }),
    }
  },
}

await bundle.bootstrapWorkflowBundle({
  env: { ...process.env, DATABASE_URL: "postgres://example.invalid/voyant" },
  channelPushDeps: {
    db,
    registry: { resolveByConnection: () => undefined },
    logger: { error: () => undefined },
  },
})

const result = await handleStepRequest({
  protocolVersion: PROTOCOL_VERSION,
  runId: "run_bundle_channel_push",
  workflowId: "channel.availability.push",
  workflowVersion: "1",
  invocationCount: 1,
  input: { limit: 1 },
  journal: {
    stepResults: {},
    waitpointsResolved: {},
    compensationsRun: {},
    metadataState: {},
    streamsCompleted: {},
  },
  environment: "development",
  deadline: Date.now() + 30_000,
  tenantMeta: {
    tenantId: "tenant_1",
    projectId: "project_1",
    organizationId: "org_1",
  },
  runMeta: {
    number: 1,
    attempt: 1,
    triggeredBy: "manual",
    tags: [],
    startedAt: Date.now(),
  },
})

console.log(JSON.stringify({ result, selectCalls }))
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
`
}
