import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { cloudflareCronTriggersForProductJobs } from "@voyant-travel/framework/worker-job-host"

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const graphPath = join(projectRoot, ".voyant/deployment-graph.generated.json")
const baseConfigPath = join(projectRoot, "wrangler.jsonc")
const outputPath = join(projectRoot, ".voyant/wrangler.generated.json")
const selfHostedOutputPath = join(projectRoot, ".voyant/wrangler.self-host.generated.json")
const managedOutputPath = join(projectRoot, ".voyant/wrangler.managed.generated.json")

const graph = JSON.parse(await readFile(graphPath, "utf8"))
const baseConfig = JSON.parse(stripJsonComments(await readFile(baseConfigPath, "utf8")))
const deploymentCrons = Array.isArray(baseConfig.triggers?.crons)
  ? baseConfig.triggers.crons
  : []
const productCrons = cloudflareCronTriggersForProductJobs(graph.provisioning?.jobs ?? [])
const selfHostedConfig = withCrons(baseConfig, [...deploymentCrons, ...productCrons])
const managedConfig = withCrons(baseConfig, deploymentCrons)
const managed = Boolean(process.env.VOYANT_CLOUD_WORKLOAD_ENVIRONMENT_ID?.trim())
const selectedConfig = managed ? managedConfig : selfHostedConfig

await Promise.all([
  writeFile(outputPath, `${JSON.stringify(selectedConfig, null, 2)}\n`),
  writeFile(selfHostedOutputPath, `${JSON.stringify(selfHostedConfig, null, 2)}\n`),
  writeFile(managedOutputPath, `${JSON.stringify(managedConfig, null, 2)}\n`),
])

function withCrons(config, crons) {
  return {
    ...config,
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
