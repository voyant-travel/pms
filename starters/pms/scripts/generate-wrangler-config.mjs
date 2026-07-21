import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { cloudflareCronTriggersForProductJobs } from "@voyant-travel/framework/worker-job-host"

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const graphPath = join(projectRoot, ".voyant/deployment-graph.generated.json")
const productBomPath = join(projectRoot, ".voyant/product-bom.generated.json")
const baseConfigPath = join(projectRoot, "wrangler.jsonc")
const outputPath = join(projectRoot, ".voyant/wrangler.generated.json")
const selfHostedOutputPath = join(projectRoot, ".voyant/wrangler.self-host.generated.json")
const managedOutputPath = join(projectRoot, ".voyant/wrangler.managed.generated.json")
const scheduleAuthority = process.env.VOYANT_PRODUCT_JOB_SCHEDULE_AUTHORITY?.trim()

if (scheduleAuthority !== "cloudflare-cron" && scheduleAuthority !== "managed-http") {
  throw new Error(
    "VOYANT_PRODUCT_JOB_SCHEDULE_AUTHORITY must be explicitly set to cloudflare-cron or managed-http.",
  )
}

const graph = await readGeneratedGraph()
const baseConfig = JSON.parse(stripJsonComments(await readFile(baseConfigPath, "utf8")))
const deploymentCrons = Array.isArray(baseConfig.triggers?.crons)
  ? baseConfig.triggers.crons
  : []
const managedConfig = withScheduleAuthority(baseConfig, deploymentCrons, "managed-http")
const selfHostedConfig =
  scheduleAuthority === "cloudflare-cron"
    ? withScheduleAuthority(
        baseConfig,
        [
          ...deploymentCrons,
          ...cloudflareCronTriggersForProductJobs(graph.provisioning?.jobs ?? []),
        ],
        "cloudflare-cron",
      )
    : undefined
const selectedConfig = selfHostedConfig ?? managedConfig

await Promise.all([
  writeFile(outputPath, `${JSON.stringify(selectedConfig, null, 2)}\n`),
  writeFile(managedOutputPath, `${JSON.stringify(managedConfig, null, 2)}\n`),
  ...(selfHostedConfig
    ? [writeFile(selfHostedOutputPath, `${JSON.stringify(selfHostedConfig, null, 2)}\n`)]
    : []),
])

async function readGeneratedGraph() {
  try {
    return JSON.parse(await readFile(graphPath, "utf8"))
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error
  }

  const productBom = JSON.parse(await readFile(productBomPath, "utf8"))
  if (!productBom.graph) {
    throw new Error(`${productBomPath} must contain graph metadata.`)
  }
  return productBom.graph
}

function withScheduleAuthority(config, crons, authority) {
  return {
    ...config,
    vars: {
      ...config.vars,
      VOYANT_PRODUCT_JOB_SCHEDULE_AUTHORITY: authority,
    },
    triggers: {
      ...config.triggers,
      crons: [...new Set(crons)],
    },
  }
}

function stripJsonComments(input) {
  let output = ""
  let inString = false
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < input.length; index++) {
    const character = input[index]
    const next = input[index + 1]
    if (lineComment) {
      if (character === "\n") {
        lineComment = false
        output += character
      }
      continue
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false
        index++
      }
      continue
    }
    if (inString) {
      output += character
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      output += character
    } else if (character === "/" && next === "/") {
      lineComment = true
      index++
    } else if (character === "/" && next === "*") {
      blockComment = true
      index++
    } else {
      output += character
    }
  }
  return output
}
